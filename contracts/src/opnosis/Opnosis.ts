/**
 * Opnosis — Bitcoin-native Batch Auction
 *
 * A faithful port of Gnosis EasyAuction to OPNet (Bitcoin Layer 1, AssemblyScript/WASM).
 *
 * Mechanism:
 *   1. An auctioneer calls initiateAuction() to deposit auctioning tokens and set a min price.
 *   2. Bidders call placeSellOrders() to deposit bidding tokens and specify their desired rate.
 *   3. Optionally, bidders cancel orders before the cancellation deadline.
 *   4. Anyone calls precalculateSellAmountSum() (optional, for large auctions) then settleAuction().
 *   5. Each bidder calls claimFromParticipantOrder() to receive their tokens.
 *
 * Clearing price: uniform-price batch auction — all winning bidders pay the same clearing price.
 * The clearing order is the marginal order whose price, together with all higher-priced orders,
 * cumulatively covers the auctioned sell amount.
 *
 * OPNet-specific adaptations vs. Gnosis EasyAuction:
 *   • Sorted doubly-linked list → insertion-sorted array (bounded: MAX_ORDERS = 100 per auction).
 *   • Gas-efficiency hints (prevSellOrders) are dropped — not needed under WASM execution model.
 *   • Timestamps use Blockchain.block.medianTimestamp (Bitcoin block median time, u64).
 *   • All amounts are u256 (Gnosis used uint96/uint64 packing).
 *   • Token ops via TransferHelper cross-contract calls to OP20 tokens.
 *   • Reentrancy guard on all state-changing entry points.
 *
 * Storage pointer layout (each u16, sequential via Blockchain.nextPointer):
 *   0  pAuctionCount      — global auction ID counter
 *   1  pUserCount         — global user ID counter
 *   2  pGlobalFeeNum      — protocol fee numerator (0–15 of 1000)
 *   3  pFeeReceiver       — protocol fee receiver address (as u256)
 *   4  pAuctioningToken   — map: auctionId → auctioning token address
 *   5  pBiddingToken      — map: auctionId → bidding token address
 *   6  pCancellationEnd   — map: auctionId → cancellation deadline (unix timestamp)
 *   7  pAuctionEnd        — map: auctionId → auction end timestamp
 *   8  pSellAmount        — map: auctionId → auctioned sell amount
 *   9  pMinBuyAmount      — map: auctionId → minimum bidding tokens desired by auctioneer
 *  10  pMinBidPerOrder    — map: auctionId → minimum bidding tokens per individual order
 *  11  pAuctionFeeNum     — map: auctionId → fee numerator snapshot at initiation
 *  12  pMinFunding        — map: auctionId → minimum funding threshold
 *  13  pIsAtomic          — map: auctionId → isAtomicClosureAllowed (1 = yes)
 *  14  pAuctioneerUserId  — map: auctionId → auctioneer's user ID
 *  15  pOrderCount        — map: auctionId → number of orders placed
 *  16  pSettled           — map: auctionId → settlement flag (1 = settled)
 *  17  pFundingNotReached — map: auctionId → min-funding-not-reached flag
 *  18  pInterimSumBid     — map: auctionId → accumulated bidding tokens during sweep
 *  19  pInterimRank       — map: auctionId → next sorted rank to process in sweep
 *  20  pClearingBuyAmount — map: auctionId → clearing order buyAmount (auctioning tokens)
 *  21  pClearingSellAmt   — map: auctionId → clearing order sellAmount (bidding tokens)
 *  22  pClearingOrderId   — map: auctionId → clearing bidder orderId (u256.Max = initial order)
 *  23  pVolumeClearing    — map: auctionId → bidding tokens consumed at clearing order
 *  24  pBidRaised         — map: auctionId → total bidding tokens raised
 *  25  pUserIdToAddr      — map: userId → address (u256)
 *  26  pAddrToUserId      — map: address (u256) → userId
 *  27  pOrderBuy          — map: orderKey(auctionId,orderId) → min auctioning tokens wanted
 *  28  pOrderSell         — map: orderKey(auctionId,orderId) → bidding tokens offered
 *  29  pOrderUser         — map: orderKey(auctionId,orderId) → userId
 *  30  pOrderCancelled    — map: orderKey(auctionId,orderId) → cancelled flag (1 = yes)
 *  31  pSortedId          — map: orderKey(auctionId,rank)   → orderId at this rank
 *  32  pClaimed           — map: orderKey(auctionId,orderId) → claimed flag (1 = yes)
 *  33  pLocked            — reentrancy guard (0 = unlocked, 1 = locked)
 *  34  pAuctionFeeReceiver — map: auctionId → fee receiver address snapshotted at initiation
 *  35  pOrderToRank       — map: orderKey(auctionId,orderId) → rank in sorted array (reverse index)
 *  36  pOrderPlacementStart — map: auctionId → order placement start timestamp (0 = immediate)
 *
 * Composite key formula: orderKey(auctionId, subIdx) = auctionId * 10000 + subIdx
 *   • Safe for MAX_ORDERS = 100 (subIdx < 10000).
 *   • Different storage maps use the same key formula but different pointer IDs,
 *     so there are no collisions.
 */

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    OP_NET,
    Revert,
    SafeMath,
    StoredMapU256,
    StoredU256,
    TransferHelper,
    U256_BYTE_LENGTH,
    ADDRESS_BYTE_LENGTH,
    BOOLEAN_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import {
    AuctionClearedEvent,
    AuctionFundingFailedEvent,
    CancellationSellOrderEvent,
    ClaimedFromOrderEvent,
    FeeParametersUpdatedEvent,
    NewAuctionEvent,
    NewSellOrderEvent,
    NewUserEvent,
} from './OpnosisEvents';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum number of orders per auction. Enforces bounded loop execution.
 *
 * Analysis (keep at 100):
 *  - insertSorted is O(n) per order → 100 inserts ≈ 5,050 comparisons worst case.
 *  - claimFromParticipantOrder scans O(n) per claim to find order rank.
 *  - Increasing to 500+ risks exceeding OPNet per-transaction execution limits.
 *  - ORDER_SCALE = 10,000 allows future increase up to ~9,999 without key collisions.
 *  - For higher volume: users create multiple auctions for the same token pair.
 */
const MAX_ORDERS: u32 = 100;

/**
 * Composite key scale factor.
 * orderKey = auctionId * ORDER_SCALE + subIndex
 * Collision-free as long as subIndex < ORDER_SCALE and ORDER_SCALE > MAX_ORDERS.
 */
const ORDER_SCALE: u256 = u256.fromU32(10000);

/** Protocol fee denominator: feeNumerator / 1000 = fee fraction. */
const FEE_DENOMINATOR: u256 = u256.fromU32(1000);

/** Maximum allowed fee numerator (15/1000 = 1.5%). */
const MAX_FEE_NUMERATOR: u256 = u256.fromU32(15);

/**
 * Sentinel value for clearingOrderId meaning "no bidder order found as clearing
 * price — the initial auction order (auctioneer's minimum price) is the clearing price."
 */
const CLEARING_NONE: u256 = u256.Max;

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Build a composite storage key from (auctionId, subIndex). */
@inline
function orderKey(auctionId: u256, subIdx: u256): u256 {
    return SafeMath.add(SafeMath.mul(auctionId, ORDER_SCALE), subIdx);
}

/**
 * Convert an Address (32-byte Uint8Array) to u256 for map key usage.
 * IMPORTANT: Both addrToU256 and u256ToAddr use big-endian encoding.
 * Changing endianness on either side would make all stored addresses unreadable.
 */
@inline
function addrToU256(addr: Address): u256 {
    return u256.fromUint8ArrayBE(addr);
}

/** Recover an Address from a u256 that was stored via addrToU256 (big-endian). */
@inline
function u256ToAddr(val: u256): Address {
    return Address.fromUint8Array(val.toUint8Array(true));
}

/**
 * Returns true if order A is "better" for the auctioneer than order B.
 * Better = higher price = higher sellAmount/buyAmount ratio.
 * Cross-multiplied (no division): aSell * bBuy > bSell * aBuy
 * Falls back to ratio comparison (integer division) when either product would overflow.
 */
@inline
function isBetterOrder(aSell: u256, aBuy: u256, bSell: u256, bBuy: u256): bool {
    if (mulWouldOverflow(aSell, bBuy) || mulWouldOverflow(bSell, aBuy)) {
        // Fall back to ratio comparison (aBuy and bBuy are always > 0 after validation).
        return SafeMath.div(aSell, aBuy) > SafeMath.div(bSell, bBuy);
    }
    return SafeMath.mul(aSell, bBuy) > SafeMath.mul(bSell, aBuy);
}

/**
 * Returns true if a bidder order meets the auctioneer's minimum price floor.
 * A bidder order (buyAmt auctioning, sellAmt bidding) is valid when:
 *   sellAmt / buyAmt  ≥  minBuyAmountBidding / auctionedSellAmount
 * Cross-multiplied: sellAmt * minBuyAmountBidding >= auctionedSellAmount * buyAmt
 * Falls back to ratio comparison when either product would overflow.
 */
@inline
function meetsMinPrice(
    bidderSell: u256,
    bidderBuy: u256,
    minBuyAmountBidding: u256,
    auctionedSellAmount: u256,
): bool {
    if (
        mulWouldOverflow(bidderSell, minBuyAmountBidding) ||
        mulWouldOverflow(auctionedSellAmount, bidderBuy)
    ) {
        // Fall back to ratio comparison (bidderBuy and auctionedSellAmount are > 0 after validation).
        return (
            SafeMath.div(bidderSell, bidderBuy) >=
            SafeMath.div(minBuyAmountBidding, auctionedSellAmount)
        );
    }
    return (
        SafeMath.mul(bidderSell, minBuyAmountBidding) >=
        SafeMath.mul(auctionedSellAmount, bidderBuy)
    );
}

/** Extract the low 32 bits of a u256 as a u32. Reverts if value exceeds u32 range. */
@inline
function u256ToU32(val: u256): u32 {
    if (val > u256.fromU32(u32.MAX_VALUE)) {
        throw new Revert('Opnosis: u256 exceeds u32 range');
    }
    return <u32>val.lo1;
}

/**
 * Returns true if a × b would overflow u256.
 * Uses the identity: a × b overflows iff b > ⌊u256.Max / a⌋ (when a ≠ 0).
 */
@inline
function mulWouldOverflow(a: u256, b: u256): bool {
    if (u256.eq(a, u256.Zero) || u256.eq(b, u256.Zero)) return false;
    return b > SafeMath.div(u256.Max, a);
}

// ─── Contract ────────────────────────────────────────────────────────────────

@final
export class Opnosis extends OP_NET {
    // ── Storage pointer allocation ───────────────────────────────────────────
    // Each Blockchain.nextPointer access returns a unique sequential u16.
    // Order here matches the storage layout documented in the file header.

    private readonly pAuctionCount: u16 = Blockchain.nextPointer;   //  0
    private readonly pUserCount: u16 = Blockchain.nextPointer;      //  1
    private readonly pGlobalFeeNum: u16 = Blockchain.nextPointer;   //  2
    private readonly pFeeReceiver: u16 = Blockchain.nextPointer;    //  3

    // Per-auction scalar maps (key = auctionId)
    private readonly pAuctioningToken: u16 = Blockchain.nextPointer;   //  4
    private readonly pBiddingToken: u16 = Blockchain.nextPointer;      //  5
    private readonly pCancellationEnd: u16 = Blockchain.nextPointer;   //  6
    private readonly pAuctionEnd: u16 = Blockchain.nextPointer;        //  7
    private readonly pSellAmount: u16 = Blockchain.nextPointer;        //  8
    private readonly pMinBuyAmount: u16 = Blockchain.nextPointer;      //  9
    private readonly pMinBidPerOrder: u16 = Blockchain.nextPointer;    // 10
    private readonly pAuctionFeeNum: u16 = Blockchain.nextPointer;     // 11
    private readonly pMinFunding: u16 = Blockchain.nextPointer;        // 12
    private readonly pIsAtomic: u16 = Blockchain.nextPointer;          // 13
    private readonly pAuctioneerUserId: u16 = Blockchain.nextPointer;  // 14
    private readonly pOrderCount: u16 = Blockchain.nextPointer;        // 15
    private readonly pSettled: u16 = Blockchain.nextPointer;           // 16
    private readonly pFundingNotReached: u16 = Blockchain.nextPointer; // 17

    // Settlement interim state (per-auction)
    private readonly pInterimSumBid: u16 = Blockchain.nextPointer;    // 18
    private readonly pInterimRank: u16 = Blockchain.nextPointer;      // 19
    private readonly pClearingBuyAmount: u16 = Blockchain.nextPointer; // 20
    private readonly pClearingSellAmt: u16 = Blockchain.nextPointer;  // 21
    private readonly pClearingOrderId: u16 = Blockchain.nextPointer;  // 22
    private readonly pVolumeClearing: u16 = Blockchain.nextPointer;   // 23
    private readonly pBidRaised: u16 = Blockchain.nextPointer;        // 24

    // User registry
    private readonly pUserIdToAddr: u16 = Blockchain.nextPointer;  // 25
    private readonly pAddrToUserId: u16 = Blockchain.nextPointer;  // 26

    // Per-order data (key = orderKey(auctionId, orderId))
    private readonly pOrderBuy: u16 = Blockchain.nextPointer;       // 27
    private readonly pOrderSell: u16 = Blockchain.nextPointer;      // 28
    private readonly pOrderUser: u16 = Blockchain.nextPointer;      // 29
    private readonly pOrderCancelled: u16 = Blockchain.nextPointer; // 30

    // Sorted order array + claim tracking (key = orderKey(auctionId, rank|orderId))
    private readonly pSortedId: u16 = Blockchain.nextPointer; // 31
    private readonly pClaimed: u16 = Blockchain.nextPointer;  // 32

    // ── Singleton scalars ────────────────────────────────────────────────────
    private readonly _auctionCount: StoredU256 = new StoredU256(
        this.pAuctionCount,
        EMPTY_POINTER,
    );
    private readonly _userCount: StoredU256 = new StoredU256(this.pUserCount, EMPTY_POINTER);
    private readonly _globalFeeNum: StoredU256 = new StoredU256(
        this.pGlobalFeeNum,
        EMPTY_POINTER,
    );
    private readonly _feeReceiver: StoredU256 = new StoredU256(this.pFeeReceiver, EMPTY_POINTER);

    // ── Per-auction maps ─────────────────────────────────────────────────────
    private readonly mapAuctioningToken: StoredMapU256 = new StoredMapU256(this.pAuctioningToken);
    private readonly mapBiddingToken: StoredMapU256 = new StoredMapU256(this.pBiddingToken);
    private readonly mapCancellationEnd: StoredMapU256 = new StoredMapU256(this.pCancellationEnd);
    private readonly mapAuctionEnd: StoredMapU256 = new StoredMapU256(this.pAuctionEnd);
    private readonly mapSellAmount: StoredMapU256 = new StoredMapU256(this.pSellAmount);
    private readonly mapMinBuyAmount: StoredMapU256 = new StoredMapU256(this.pMinBuyAmount);
    private readonly mapMinBidPerOrder: StoredMapU256 = new StoredMapU256(this.pMinBidPerOrder);
    private readonly mapAuctionFeeNum: StoredMapU256 = new StoredMapU256(this.pAuctionFeeNum);
    private readonly mapMinFunding: StoredMapU256 = new StoredMapU256(this.pMinFunding);
    private readonly mapIsAtomic: StoredMapU256 = new StoredMapU256(this.pIsAtomic);
    private readonly mapAuctioneerUserId: StoredMapU256 = new StoredMapU256(
        this.pAuctioneerUserId,
    );
    private readonly mapOrderCount: StoredMapU256 = new StoredMapU256(this.pOrderCount);
    private readonly mapSettled: StoredMapU256 = new StoredMapU256(this.pSettled);
    private readonly mapFundingNotReached: StoredMapU256 = new StoredMapU256(
        this.pFundingNotReached,
    );
    private readonly mapInterimSumBid: StoredMapU256 = new StoredMapU256(this.pInterimSumBid);
    private readonly mapInterimRank: StoredMapU256 = new StoredMapU256(this.pInterimRank);
    private readonly mapClearingBuyAmount: StoredMapU256 = new StoredMapU256(
        this.pClearingBuyAmount,
    );
    private readonly mapClearingSellAmt: StoredMapU256 = new StoredMapU256(this.pClearingSellAmt);
    private readonly mapClearingOrderId: StoredMapU256 = new StoredMapU256(this.pClearingOrderId);
    private readonly mapVolumeClearing: StoredMapU256 = new StoredMapU256(this.pVolumeClearing);
    private readonly mapBidRaised: StoredMapU256 = new StoredMapU256(this.pBidRaised);

    // ── User registry maps ───────────────────────────────────────────────────
    private readonly mapUserIdToAddr: StoredMapU256 = new StoredMapU256(this.pUserIdToAddr);
    private readonly mapAddrToUserId: StoredMapU256 = new StoredMapU256(this.pAddrToUserId);

    // ── Order data maps ──────────────────────────────────────────────────────
    private readonly mapOrderBuy: StoredMapU256 = new StoredMapU256(this.pOrderBuy);
    private readonly mapOrderSell: StoredMapU256 = new StoredMapU256(this.pOrderSell);
    private readonly mapOrderUser: StoredMapU256 = new StoredMapU256(this.pOrderUser);
    private readonly mapOrderCancelled: StoredMapU256 = new StoredMapU256(this.pOrderCancelled);
    private readonly mapSortedId: StoredMapU256 = new StoredMapU256(this.pSortedId);
    private readonly mapClaimed: StoredMapU256 = new StoredMapU256(this.pClaimed);

    // ── Reentrancy guard ─────────────────────────────────────────────────────
    private readonly pLocked: u16 = Blockchain.nextPointer; // 33
    private readonly _locked: StoredU256 = new StoredU256(this.pLocked, EMPTY_POINTER);

    // Per-auction fee receiver snapshot — prevents owner front-running settlement (pointer 34)
    private readonly pAuctionFeeReceiver: u16 = Blockchain.nextPointer; // 34
    private readonly mapAuctionFeeReceiver: StoredMapU256 = new StoredMapU256(
        this.pAuctionFeeReceiver,
    );

    // Reverse rank map: orderKey(auctionId, orderId) → rank in sorted array (pointer 35)
    // Eliminates O(n) scan in claimFromParticipantOrder — constant-time rank lookup.
    private readonly pOrderToRank: u16 = Blockchain.nextPointer; // 35
    private readonly mapOrderToRank: StoredMapU256 = new StoredMapU256(this.pOrderToRank);

    // Per-auction order placement start timestamp (0 = immediate) (pointer 36)
    private readonly pOrderPlacementStart: u16 = Blockchain.nextPointer; // 36
    private readonly mapOrderPlacementStart: StoredMapU256 = new StoredMapU256(
        this.pOrderPlacementStart,
    );

    public constructor() {
        super();
    }

    // ── Deployment ───────────────────────────────────────────────────────────

    public override onDeployment(_calldata: Calldata): void {
        // Default fee: 0% (no fee). Owner can update via setFeeParameters.
        this._globalFeeNum.value = u256.Zero;
        // Default fee receiver: deployer.
        this._feeReceiver.value = addrToU256(Blockchain.tx.sender);
    }

    // ── Update hook (required for OPNet upgradeability) ──────────────────

    public override onUpdate(_calldata: Calldata): void {
        // Reserved for future upgrades. No-op until migration logic is needed.
    }

    // ── Reentrancy guard ─────────────────────────────────────────────────────

    private lock(): void {
        if (!u256.eq(this._locked.value, u256.Zero)) {
            throw new Revert('Opnosis: reentrant call');
        }
        this._locked.value = u256.One;
    }

    private unlock(): void {
        this._locked.value = u256.Zero;
    }

    // ── Phase guards ─────────────────────────────────────────────────────────

    /** Revert if auction is not in the order-placement phase (before auctionEndDate, after startDate). */
    private requireOrderPlacement(auctionId: u256): void {
        if (u256.eq(this.mapSellAmount.get(auctionId), u256.Zero)) {
            throw new Revert('Opnosis: auction does not exist');
        }
        const now = u256.fromU64(Blockchain.block.medianTimestamp);
        const startDate = this.mapOrderPlacementStart.get(auctionId);
        if (!u256.eq(startDate, u256.Zero) && now < startDate) {
            throw new Revert('Opnosis: order placement has not started');
        }
        if (now >= this.mapAuctionEnd.get(auctionId)) {
            throw new Revert('Opnosis: auction has ended');
        }
        if (!u256.eq(this.mapSettled.get(auctionId), u256.Zero)) {
            throw new Revert('Opnosis: auction already settled');
        }
    }

    /** Revert if auction is not in the solution-submission phase (after auctionEndDate, not settled). */
    private requireSolutionSubmission(auctionId: u256): void {
        if (u256.eq(this.mapSellAmount.get(auctionId), u256.Zero)) {
            throw new Revert('Opnosis: auction does not exist');
        }
        const now = u256.fromU64(Blockchain.block.medianTimestamp);
        if (now < this.mapAuctionEnd.get(auctionId)) {
            throw new Revert('Opnosis: auction has not ended yet');
        }
        if (!u256.eq(this.mapSettled.get(auctionId), u256.Zero)) {
            throw new Revert('Opnosis: auction already settled');
        }
    }

    /** Revert if auction is not in the finished phase (fully settled). */
    private requireFinished(auctionId: u256): void {
        if (u256.eq(this.mapSellAmount.get(auctionId), u256.Zero)) {
            throw new Revert('Opnosis: auction does not exist');
        }
        if (u256.eq(this.mapSettled.get(auctionId), u256.Zero)) {
            throw new Revert('Opnosis: auction not yet settled');
        }
    }

    // ── User registry ─────────────────────────────────────────────────────────

    /**
     * Return the existing userId for `addr`, or register a new one (starting at 1).
     * Emits NewUser on first registration.
     */
    private getOrRegisterUser(addr: Address): u256 {
        const addrKey = addrToU256(addr);
        const existing = this.mapAddrToUserId.get(addrKey);
        if (!u256.eq(existing, u256.Zero)) {
            return existing;
        }
        // Assign the next sequential user ID.
        const newId = SafeMath.add(this._userCount.value, u256.One);
        this._userCount.value = newId;
        this.mapAddrToUserId.set(addrKey, newId);
        this.mapUserIdToAddr.set(newId, addrKey);
        this.emitEvent(new NewUserEvent(newId, addr));
        return newId;
    }

    // ── Sorted insertion ──────────────────────────────────────────────────────

    /**
     * Insert `orderId` into the sorted rank array for `auctionId`, maintaining descending
     * price order (rank 0 = best price for auctioneer = highest sellAmount/buyAmount ratio).
     *
     * Uses bounded insertion sort: O(MAX_ORDERS) per call. currentSize is the number of
     * orders already in the sorted array before this insertion.
     */
    private insertSorted(
        auctionId: u256,
        orderId: u256,
        buyAmt: u256,
        sellAmt: u256,
        currentSize: u32,
    ): void {
        // Find the first rank where the new order is NOT better than the existing order.
        // That rank is the insertion point (new order goes before the existing one it beats).
        let insertRank: u32 = currentSize; // default: append at end
        for (let r: u32 = 0; r < currentSize; r++) {
            const existingId = this.mapSortedId.get(orderKey(auctionId, u256.fromU32(r)));
            const eBuy = this.mapOrderBuy.get(orderKey(auctionId, existingId));
            const eSell = this.mapOrderSell.get(orderKey(auctionId, existingId));
            if (isBetterOrder(sellAmt, buyAmt, eSell, eBuy)) {
                insertRank = r;
                break;
            }
        }
        // Shift everything at insertRank and above one position right to make room.
        // Also update the reverse rank map for each shifted order.
        for (let r: u32 = currentSize; r > insertRank; r--) {
            const prev = this.mapSortedId.get(orderKey(auctionId, u256.fromU32(r - 1)));
            this.mapSortedId.set(orderKey(auctionId, u256.fromU32(r)), prev);
            this.mapOrderToRank.set(orderKey(auctionId, prev), u256.fromU32(r));
        }
        // Place the new order at insertRank and record its rank.
        this.mapSortedId.set(orderKey(auctionId, u256.fromU32(insertRank)), orderId);
        this.mapOrderToRank.set(orderKey(auctionId, orderId), u256.fromU32(insertRank));
    }

    // ── Settlement sweep ──────────────────────────────────────────────────────

    /**
     * Walk up to `steps` ranks of the sorted order book, accumulating bidding token supply,
     * until the clearing price is found.
     *
     * Clearing condition (mirrors Gnosis EasyAuction):
     *   order.buyAmount * auctionedSellAmount  <=  interimSumBid * order.sellAmount
     *
     * Interpretation: "the cumulative bidding tokens already counted (before this order)
     * can purchase the full auctioned amount at this order's price." → this order is the
     * marginal (clearing) order.
     *
     * Returns true if clearing was found (either now or in a previous call).
     * Persists progress so subsequent calls continue from where we left off.
     */
    private sweepOrders(auctionId: u256, steps: u32): bool {
        // If clearing was already found in a previous precalculate call, nothing to do.
        if (!u256.eq(this.mapClearingOrderId.get(auctionId), CLEARING_NONE)) {
            return true;
        }

        const auctionedSellAmount = this.mapSellAmount.get(auctionId);
        const totalOrders = u256ToU32(this.mapOrderCount.get(auctionId));
        let sumBid = this.mapInterimSumBid.get(auctionId);
        let rank = u256ToU32(this.mapInterimRank.get(auctionId));

        for (let i: u32 = 0; i < steps; i++) {
            if (rank >= totalOrders) {
                // Exhausted all orders — clearing stays at initial auction order (CLEARING_NONE).
                // sumBid = total valid bidding tokens collected.
                this.mapInterimSumBid.set(auctionId, sumBid);
                this.mapInterimRank.set(auctionId, u256.fromU32(rank));
                return false;
            }

            const orderId = this.mapSortedId.get(orderKey(auctionId, u256.fromU32(rank)));

            // Skip cancelled orders — their tokens were already returned.
            if (!u256.eq(this.mapOrderCancelled.get(orderKey(auctionId, orderId)), u256.Zero)) {
                rank += 1;
                continue;
            }

            const buyAmt = this.mapOrderBuy.get(orderKey(auctionId, orderId));
            const sellAmt = this.mapOrderSell.get(orderKey(auctionId, orderId));

            // Check clearing condition BEFORE adding this order's contribution.
            // sumBid is the bidding tokens from all higher-priced orders already processed
            // (intentionally excludes the current order). The clearing order is the marginal
            // order whose price, combined with all PRIOR (higher-priced) orders' cumulative
            // bidding tokens, is sufficient to purchase the full auctioned sell amount.
            // Overflow-safe: buyAmt * auctionedSellAmount <= sumBid * sellAmt
            let clearingMet: bool;
            if (mulWouldOverflow(buyAmt, auctionedSellAmount)) {
                // LHS overflows → astronomically large → condition is false.
                clearingMet = false;
            } else if (mulWouldOverflow(sumBid, sellAmt)) {
                // RHS overflows but LHS doesn't → RHS ≥ LHS → condition is true.
                clearingMet = true;
            } else {
                clearingMet =
                    SafeMath.mul(buyAmt, auctionedSellAmount) <= SafeMath.mul(sumBid, sellAmt);
            }
            if (clearingMet) {
                // ── Clearing order found ─────────────────────────────────────
                // Clearing price = sellAmt / buyAmt (bidding tokens per auctioning token).

                this.mapClearingBuyAmount.set(auctionId, buyAmt);
                this.mapClearingSellAmt.set(auctionId, sellAmt);
                this.mapClearingOrderId.set(auctionId, orderId); // non-Max → valid bidder order

                // Bidding tokens consumed from the clearing order:
                //   volumeClearing = auctionedSellAmount * sellAmt / buyAmt  -  sumBid
                // This is the portion of the clearing order's bidding tokens that pays for
                // the remaining auctioning tokens not covered by higher-priced orders.
                let grossBid: u256;
                if (mulWouldOverflow(auctionedSellAmount, sellAmt)) {
                    // Overflow: compute via (auctionedSellAmount / buyAmt) * sellAmt instead.
                    // Less precise but safe — and capped below anyway.
                    grossBid = SafeMath.mul(SafeMath.div(auctionedSellAmount, buyAmt), sellAmt);
                } else {
                    grossBid = SafeMath.div(SafeMath.mul(auctionedSellAmount, sellAmt), buyAmt);
                }
                // CRITICAL: saturating subtraction — integer division can make grossBid < sumBid.
                let volClearing: u256;
                if (grossBid > sumBid) {
                    volClearing = SafeMath.sub(grossBid, sumBid);
                } else {
                    volClearing = u256.Zero;
                }
                // Cap at the clearing order's sellAmount: cannot consume more than it offers.
                if (volClearing > sellAmt) {
                    volClearing = sellAmt;
                }

                this.mapVolumeClearing.set(auctionId, volClearing);
                // Total bidding tokens raised = all above-clearing orders + partial clearing order.
                this.mapBidRaised.set(auctionId, SafeMath.add(sumBid, volClearing));
                this.mapInterimSumBid.set(auctionId, sumBid);
                this.mapInterimRank.set(auctionId, u256.fromU32(rank));
                return true;
            }

            // This order does not yet trigger clearing — add its contribution and advance.
            sumBid = SafeMath.add(sumBid, sellAmt);
            rank += 1;
        }

        // Saved partial progress.
        this.mapInterimSumBid.set(auctionId, sumBid);
        this.mapInterimRank.set(auctionId, u256.fromU32(rank));
        return false;
    }

    // ── Post-settlement accounting ────────────────────────────────────────────

    /**
     * After settlement: transfer auctioneer proceeds and protocol fee.
     *
     * Token flows:
     *   fundingNotReached = true  →  auctioning tokens (+ fee deposit) returned to auctioneer;
     *                                bidding tokens stay in contract for bidders to claim.
     *   fundingNotReached = false →  raised bidding tokens sent to auctioneer;
     *                                unsold auctioning tokens returned to auctioneer;
     *                                protocol fee in auctioning tokens sent to feeReceiver;
     *                                sold auctioning tokens stay in contract for bidders to claim.
     */
    private processFeesAndAuctioneerFunds(auctionId: u256): void {
        const auctioningTokenAddr = u256ToAddr(this.mapAuctioningToken.get(auctionId));
        const biddingTokenAddr = u256ToAddr(this.mapBiddingToken.get(auctionId));
        const auctioneerAddr = u256ToAddr(
            this.mapUserIdToAddr.get(this.mapAuctioneerUserId.get(auctionId)),
        );
        // Use the feeReceiver snapshotted at auction initiation — not the current global value.
        const feeReceiverAddr = u256ToAddr(this.mapAuctionFeeReceiver.get(auctionId));
        const feeNum = this.mapAuctionFeeNum.get(auctionId);
        const auctionedSellAmount = this.mapSellAmount.get(auctionId);
        const bidRaised = this.mapBidRaised.get(auctionId);
        const fundingNotReached = !u256.eq(this.mapFundingNotReached.get(auctionId), u256.Zero);

        if (fundingNotReached) {
            // Return all auctioning tokens (principal + fee deposit) to auctioneer.
            // Bidding tokens from all orders remain in the contract for bidders to claim.
            const feeDeposit = SafeMath.div(SafeMath.mul(auctionedSellAmount, feeNum), FEE_DENOMINATOR);
            const totalReturn = SafeMath.add(auctionedSellAmount, feeDeposit);
            if (totalReturn > u256.Zero) {
                TransferHelper.transfer(auctioningTokenAddr, auctioneerAddr, totalReturn);
            }
        } else {
            // ── Happy path: auction cleared successfully ──────────────────────
            const clearingBuyAmount = this.mapClearingBuyAmount.get(auctionId);
            const clearingSellAmt = this.mapClearingSellAmt.get(auctionId);

            // Total auctioning tokens paid out to winning bidders at clearing price.
            //   auctioningSold = bidRaised * clearingBuyAmount / clearingSellAmt
            // CRITICAL: bidRaised * clearingBuyAmount can overflow — use mulWouldOverflow guard.
            let auctioningSold: u256;
            if (mulWouldOverflow(bidRaised, clearingBuyAmount)) {
                // Overflow: the product is enormous, meaning all auctioning tokens are sold.
                // Note: this caps auctioningSold at the full amount, which means the fee
                // calculation below uses the full sell amount — a slight overcharge vs. the
                // precise value, but safe since the fee deposit already covers it.
                auctioningSold = auctionedSellAmount;
            } else {
                auctioningSold = SafeMath.div(
                    SafeMath.mul(bidRaised, clearingBuyAmount),
                    clearingSellAmt,
                );
                if (auctioningSold > auctionedSellAmount) {
                    auctioningSold = auctionedSellAmount;
                }
            }

            // Unsold auctioning tokens go back to auctioneer.
            const unsoldAuctioning = SafeMath.sub(auctionedSellAmount, auctioningSold);

            // Protocol fee (taken from the fee deposit already in the contract).
            const feeAmount = SafeMath.div(
                SafeMath.mul(auctionedSellAmount, feeNum),
                FEE_DENOMINATOR,
            );

            // Transfer all raised bidding tokens to auctioneer.
            if (bidRaised > u256.Zero) {
                TransferHelper.transfer(biddingTokenAddr, auctioneerAddr, bidRaised);
            }
            // Return any unsold auctioning tokens to auctioneer.
            if (unsoldAuctioning > u256.Zero) {
                TransferHelper.transfer(auctioningTokenAddr, auctioneerAddr, unsoldAuctioning);
            }
            // Send protocol fee in auctioning tokens to fee receiver.
            if (feeAmount > u256.Zero) {
                TransferHelper.transfer(auctioningTokenAddr, feeReceiverAddr, feeAmount);
            }
            // auctioningSold tokens remain in contract for winning bidders to claim.
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ── Public entry points ──────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Initiate a new batch auction.
     *
     * The caller (auctioneer) deposits `auctionedSellAmount + fee` auctioning tokens.
     * Fee = `auctionedSellAmount * globalFeeNumerator / 1000`.
     *
     * @param auctioningToken           OP20 token being sold.
     * @param biddingToken              OP20 token accepted as bids.
     * @param orderPlacementStartDate   Unix timestamp (seconds) at which bidding opens (0 = immediate).
     * @param cancellationEndDate       Unix timestamp (seconds) after which orders cannot be cancelled.
     * @param auctionEndDate            Unix timestamp (seconds) at which the auction ends.
     * @param auctionedSellAmount       Amount of auctioning tokens for sale.
     * @param minBuyAmount              Minimum bidding tokens the auctioneer is willing to accept
     *                                  in total (defines the price floor).
     * @param minimumBiddingAmountPerOrder  Minimum bidding tokens per individual order.
     * @param minFundingThreshold       Minimum total bidding tokens raised for the auction to clear.
     *                                  If not reached, all participants are fully refunded.
     * @param isAtomicClosureAllowed    Reserved for future atomic-closure support (stored, not enforced).
     * @returns auctionId               The ID of the newly created auction.
     */
    @method(
        { name: 'auctioningToken', type: ABIDataTypes.ADDRESS },
        { name: 'biddingToken', type: ABIDataTypes.ADDRESS },
        { name: 'orderPlacementStartDate', type: ABIDataTypes.UINT256 },
        { name: 'cancellationEndDate', type: ABIDataTypes.UINT256 },
        { name: 'auctionEndDate', type: ABIDataTypes.UINT256 },
        { name: 'auctionedSellAmount', type: ABIDataTypes.UINT256 },
        { name: 'minBuyAmount', type: ABIDataTypes.UINT256 },
        { name: 'minimumBiddingAmountPerOrder', type: ABIDataTypes.UINT256 },
        { name: 'minFundingThreshold', type: ABIDataTypes.UINT256 },
        { name: 'isAtomicClosureAllowed', type: ABIDataTypes.BOOL },
    )
    @emit('NewAuction')
    @returns({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    public initiateAuction(calldata: Calldata): BytesWriter {
        this.lock();

        const auctioningToken = calldata.readAddress();
        const biddingToken = calldata.readAddress();
        const orderPlacementStartDate = calldata.readU256();
        const cancellationEndDate = calldata.readU256();
        const auctionEndDate = calldata.readU256();
        const auctionedSellAmount = calldata.readU256();
        const minBuyAmount = calldata.readU256();
        const minimumBiddingAmountPerOrder = calldata.readU256();
        const minFundingThreshold = calldata.readU256();
        const isAtomicClosureAllowed = calldata.readBoolean();

        // ── Checks ───────────────────────────────────────────────────────────
        if (u256.eq(auctionedSellAmount, u256.Zero)) {
            throw new Revert('Opnosis: zero sell amount');
        }
        if (u256.eq(minBuyAmount, u256.Zero)) {
            throw new Revert('Opnosis: zero min buy amount');
        }
        if (u256.eq(minimumBiddingAmountPerOrder, u256.Zero)) {
            throw new Revert('Opnosis: zero min bid per order');
        }
        const now = u256.fromU64(Blockchain.block.medianTimestamp);
        if (auctionEndDate <= now) {
            throw new Revert('Opnosis: auction end must be in the future');
        }
        // orderPlacementStartDate must be <= cancellationEndDate (if non-zero)
        if (!u256.eq(orderPlacementStartDate, u256.Zero) && orderPlacementStartDate > cancellationEndDate) {
            throw new Revert('Opnosis: order placement start exceeds cancellation end');
        }
        if (cancellationEndDate > auctionEndDate) {
            throw new Revert('Opnosis: cancellation end exceeds auction end');
        }
        if (u256.eq(addrToU256(auctioningToken), addrToU256(biddingToken))) {
            throw new Revert('Opnosis: auctioning and bidding tokens must differ');
        }

        // ── Effects ──────────────────────────────────────────────────────────
        const sender = Blockchain.tx.sender;
        const userId = this.getOrRegisterUser(sender);

        const auctionId = SafeMath.add(this._auctionCount.value, u256.One);
        this._auctionCount.value = auctionId;

        // Snapshot the current global fee for this auction.
        const feeNum = this._globalFeeNum.value;
        const feeDeposit = SafeMath.div(SafeMath.mul(auctionedSellAmount, feeNum), FEE_DENOMINATOR);
        const totalDeposit = SafeMath.add(auctionedSellAmount, feeDeposit);

        // Store all auction fields.
        this.mapAuctioningToken.set(auctionId, addrToU256(auctioningToken));
        this.mapBiddingToken.set(auctionId, addrToU256(biddingToken));
        this.mapCancellationEnd.set(auctionId, cancellationEndDate);
        this.mapAuctionEnd.set(auctionId, auctionEndDate);
        this.mapSellAmount.set(auctionId, auctionedSellAmount);
        this.mapMinBuyAmount.set(auctionId, minBuyAmount);
        this.mapMinBidPerOrder.set(auctionId, minimumBiddingAmountPerOrder);
        this.mapAuctionFeeNum.set(auctionId, feeNum);
        // Snapshot feeReceiver at auction creation — owner cannot redirect proceeds later.
        this.mapAuctionFeeReceiver.set(auctionId, this._feeReceiver.value);
        this.mapMinFunding.set(auctionId, minFundingThreshold);
        this.mapIsAtomic.set(auctionId, isAtomicClosureAllowed ? u256.One : u256.Zero);
        this.mapAuctioneerUserId.set(auctionId, userId);
        this.mapOrderPlacementStart.set(auctionId, orderPlacementStartDate);
        this.mapOrderCount.set(auctionId, u256.Zero);
        this.mapSettled.set(auctionId, u256.Zero);
        this.mapFundingNotReached.set(auctionId, u256.Zero);
        this.mapInterimSumBid.set(auctionId, u256.Zero);
        this.mapInterimRank.set(auctionId, u256.Zero);
        // Default clearing = initial auction order (auctioneer's minimum price).
        // Stored from bidder perspective: buyAmount = auctionedSellAmount (auctioning tokens wanted),
        //                                sellAmount = minBuyAmount (bidding tokens offered at floor).
        this.mapClearingBuyAmount.set(auctionId, auctionedSellAmount);
        this.mapClearingSellAmt.set(auctionId, minBuyAmount);
        this.mapClearingOrderId.set(auctionId, CLEARING_NONE); // sentinel
        this.mapVolumeClearing.set(auctionId, u256.Zero);
        this.mapBidRaised.set(auctionId, u256.Zero);

        this.emitEvent(
            new NewAuctionEvent(
                auctionId,
                auctioningToken,
                biddingToken,
                userId,
                auctionedSellAmount,
                minBuyAmount,
            ),
        );

        // ── Interactions ─────────────────────────────────────────────────────
        TransferHelper.transferFrom(
            auctioningToken,
            sender,
            Blockchain.contractAddress,
            totalDeposit,
        );

        this.unlock();

        const response = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(auctionId);
        return response;
    }

    /**
     * Place one or more sell orders in an ongoing auction.
     *
     * Each order specifies:
     *   minBuyAmounts[i]  — minimum auctioning tokens the bidder wants.
     *   sellAmounts[i]    — bidding tokens the bidder deposits and offers.
     *
     * The implied price = sellAmounts[i] / minBuyAmounts[i] (bidding per auctioning).
     * Orders below the auction's minimum price are rejected.
     *
     * Bidding tokens are transferred from the caller to the contract immediately.
     * Up to MAX_ORDERS (100) orders are allowed per auction.
     */
    @method(
        { name: 'auctionId', type: ABIDataTypes.UINT256 },
        { name: 'minBuyAmounts', type: ABIDataTypes.ARRAY_OF_UINT256 },
        { name: 'sellAmounts', type: ABIDataTypes.ARRAY_OF_UINT256 },
    )
    @emit('NewSellOrder')
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public placeSellOrders(calldata: Calldata): BytesWriter {
        this.lock();

        const auctionId = calldata.readU256();
        const minBuyAmounts = calldata.readU256Array();
        const sellAmounts = calldata.readU256Array();

        // ── Checks ───────────────────────────────────────────────────────────
        this.requireOrderPlacement(auctionId);

        if (minBuyAmounts.length !== sellAmounts.length) {
            throw new Revert('Opnosis: array length mismatch');
        }
        if (minBuyAmounts.length > i32(MAX_ORDERS)) {
            throw new Revert('Opnosis: too many orders in one call');
        }

        const auctionedSellAmount = this.mapSellAmount.get(auctionId);
        const minBuyAmountBidding = this.mapMinBuyAmount.get(auctionId);
        const minBidPerOrder = this.mapMinBidPerOrder.get(auctionId);
        const biddingTokenAddr = u256ToAddr(this.mapBiddingToken.get(auctionId));
        const sender = Blockchain.tx.sender;
        const userId = this.getOrRegisterUser(sender);

        // ── Effects ──────────────────────────────────────────────────────────
        let totalBidding: u256 = u256.Zero;
        let orderCount = this.mapOrderCount.get(auctionId);

        for (let i = 0; i < minBuyAmounts.length; i++) {
            if (u256ToU32(orderCount) >= MAX_ORDERS) {
                throw new Revert('Opnosis: max order limit reached');
            }

            const buyAmt = minBuyAmounts[i];
            const sellAmt = sellAmounts[i];

            if (u256.eq(buyAmt, u256.Zero)) {
                throw new Revert('Opnosis: zero minBuyAmount');
            }
            if (u256.eq(sellAmt, u256.Zero)) {
                throw new Revert('Opnosis: zero sellAmount');
            }
            if (sellAmt < minBidPerOrder) {
                throw new Revert('Opnosis: below minimumBiddingAmountPerOrder');
            }
            if (!meetsMinPrice(sellAmt, buyAmt, minBuyAmountBidding, auctionedSellAmount)) {
                throw new Revert('Opnosis: order price below auction minimum');
            }

            // Assign orderId = current order count (0-indexed).
            const orderId = orderCount;
            const key = orderKey(auctionId, orderId);

            this.mapOrderBuy.set(key, buyAmt);
            this.mapOrderSell.set(key, sellAmt);
            this.mapOrderUser.set(key, userId);
            this.mapOrderCancelled.set(key, u256.Zero);

            // Insert into sorted rank array (descending price order).
            this.insertSorted(auctionId, orderId, buyAmt, sellAmt, u256ToU32(orderCount));

            orderCount = SafeMath.add(orderCount, u256.One);
            totalBidding = SafeMath.add(totalBidding, sellAmt);

            this.emitEvent(new NewSellOrderEvent(auctionId, userId, buyAmt, sellAmt));
        }

        this.mapOrderCount.set(auctionId, orderCount);

        // ── Interactions ─────────────────────────────────────────────────────
        TransferHelper.transferFrom(
            biddingTokenAddr,
            sender,
            Blockchain.contractAddress,
            totalBidding,
        );

        this.unlock();

        const response = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Cancel one or more of the caller's orders before the cancellation deadline.
     *
     * Bidding tokens are returned to the caller immediately on cancellation.
     * Cancelled orders are skipped during settlement (they do not affect the clearing price)
     * and skipped during claims (already refunded here).
     */
    @method(
        { name: 'auctionId', type: ABIDataTypes.UINT256 },
        { name: 'orderIds', type: ABIDataTypes.ARRAY_OF_UINT256 },
    )
    @emit('CancellationSellOrder')
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public cancelSellOrders(calldata: Calldata): BytesWriter {
        this.lock();

        const auctionId = calldata.readU256();
        const orderIds = calldata.readU256Array();

        // ── Checks ───────────────────────────────────────────────────────────
        if (u256.eq(this.mapSellAmount.get(auctionId), u256.Zero)) {
            throw new Revert('Opnosis: auction does not exist');
        }
        if (!u256.eq(this.mapSettled.get(auctionId), u256.Zero)) {
            throw new Revert('Opnosis: auction already settled');
        }

        const now = u256.fromU64(Blockchain.block.medianTimestamp);
        const cancellationEnd = this.mapCancellationEnd.get(auctionId);
        if (now >= cancellationEnd) {
            throw new Revert('Opnosis: cancellation period has ended');
        }

        const sender = Blockchain.tx.sender;
        const callerUserId = this.mapAddrToUserId.get(addrToU256(sender));
        if (u256.eq(callerUserId, u256.Zero)) {
            throw new Revert('Opnosis: caller has no registered orders');
        }

        if (orderIds.length > i32(MAX_ORDERS)) {
            throw new Revert('Opnosis: too many order IDs in one call');
        }

        const biddingTokenAddr = u256ToAddr(this.mapBiddingToken.get(auctionId));

        // ── Effects ──────────────────────────────────────────────────────────
        let totalRefund: u256 = u256.Zero;
        const totalOrders = this.mapOrderCount.get(auctionId);

        for (let i = 0; i < orderIds.length; i++) {
            const orderId = orderIds[i];
            // CRITICAL: bounds check prevents cross-auction key collision
            if (orderId >= totalOrders) {
                throw new Revert('Opnosis: orderId out of range');
            }
            const key = orderKey(auctionId, orderId);

            if (!u256.eq(this.mapOrderUser.get(key), callerUserId)) {
                throw new Revert('Opnosis: not the order owner');
            }
            if (!u256.eq(this.mapOrderCancelled.get(key), u256.Zero)) {
                throw new Revert('Opnosis: order already cancelled');
            }

            const sellAmt = this.mapOrderSell.get(key);
            const buyAmt = this.mapOrderBuy.get(key);

            this.mapOrderCancelled.set(key, u256.One);
            totalRefund = SafeMath.add(totalRefund, sellAmt);

            this.emitEvent(new CancellationSellOrderEvent(auctionId, callerUserId, buyAmt, sellAmt));
        }

        // ── Interactions ─────────────────────────────────────────────────────
        if (totalRefund > u256.Zero) {
            TransferHelper.transfer(biddingTokenAddr, sender, totalRefund);
        }

        this.unlock();

        const response = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        response.writeBoolean(true);
        return response;
    }

    /**
     * Advance the settlement sweep by up to `iterationSteps` ranks.
     *
     * This can be called multiple times before settleAuction() to split the O(n) sweep
     * across multiple transactions, avoiding potential execution-cost limits on large auctions.
     * Once clearing is found or all orders are exhausted, subsequent calls are no-ops.
     *
     * Must be called after the auction end date.
     */
    @method(
        { name: 'auctionId', type: ABIDataTypes.UINT256 },
        { name: 'iterationSteps', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'clearingFound', type: ABIDataTypes.BOOL })
    public precalculateSellAmountSum(calldata: Calldata): BytesWriter {
        this.lock();

        const auctionId = calldata.readU256();
        const stepsU256 = calldata.readU256();

        this.requireSolutionSubmission(auctionId);

        // Cap steps at MAX_ORDERS to prevent u256→u32 truncation attacks.
        let steps = u256ToU32(stepsU256);
        if (steps > MAX_ORDERS) {
            steps = MAX_ORDERS;
        }

        const found = this.sweepOrders(auctionId, steps);

        this.unlock();

        const response = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        response.writeBoolean(found);
        return response;
    }

    /**
     * Settle the auction: find the clearing price, send proceeds to the auctioneer,
     * and mark the auction as finished.
     *
     * Must be called after the auction end date.
     * Any unfinished sweep from precalculateSellAmountSum is completed here (bounded by MAX_ORDERS).
     *
     * Clearing price determination:
     *   • Walks sorted orders from best price to worst.
     *   • The clearing order is the first order where cumulative bidding tokens
     *     (from higher-priced orders) can already purchase the full auctioned amount
     *     at this order's implied price.
     *   • If no bidder order satisfies this, the auctioneer's minimum price is the clearing price.
     *   • If total raised < minFundingThreshold, the auction fails and all are refunded.
     *
     * @returns clearingBuyAmount   The buyAmount field of the clearing order (auctioning tokens).
     */
    @method({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @emit('AuctionCleared')
    @returns({ name: 'clearingBuyAmount', type: ABIDataTypes.UINT256 })
    public settleAuction(calldata: Calldata): BytesWriter {
        this.lock();

        const auctionId = calldata.readU256();
        this.requireSolutionSubmission(auctionId);

        // Complete any remaining sweep (bounded by MAX_ORDERS total iterations).
        this.sweepOrders(auctionId, MAX_ORDERS);

        // At this point clearingOrderId is either a valid bidder orderId or CLEARING_NONE.
        // clearingBuyAmount / clearingSellAmt are set correctly in both cases
        // (initialised to minBuyAmount / auctionedSellAmount in initiateAuction).

        const clearingBuyAmount = this.mapClearingBuyAmount.get(auctionId);
        const clearingSellAmt = this.mapClearingSellAmt.get(auctionId);
        const clearingOrderId = this.mapClearingOrderId.get(auctionId);
        const auctionedSellAmount = this.mapSellAmount.get(auctionId);
        const minFunding = this.mapMinFunding.get(auctionId);

        // When clearing stayed at CLEARING_NONE (initial auction order):
        // all collected bids (interimSumBid after full sweep) are the total bidding raised.
        if (u256.eq(clearingOrderId, CLEARING_NONE)) {
            const interimSumBid = this.mapInterimSumBid.get(auctionId);
            this.mapBidRaised.set(auctionId, interimSumBid);
            // Volume at clearing = all raised bidding tokens (whole auctionedSellAmount on offer).
            this.mapVolumeClearing.set(auctionId, interimSumBid);
        }

        const bidRaised = this.mapBidRaised.get(auctionId);

        // ── Minimum funding threshold check ───────────────────────────────────
        if (bidRaised < minFunding) {
            this.mapFundingNotReached.set(auctionId, u256.One);
            this.emitEvent(new AuctionFundingFailedEvent(auctionId, bidRaised, minFunding));
        }

        // ── Mark auction settled (EFFECTS before INTERACTIONS) ────────────────
        this.mapSettled.set(auctionId, u256.One);

        this.emitEvent(new AuctionClearedEvent(auctionId, clearingBuyAmount, clearingSellAmt));

        // ── Send auctioneer proceeds and fee ─────────────────────────────────
        this.processFeesAndAuctioneerFunds(auctionId);

        this.unlock();

        const response = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(clearingBuyAmount);
        return response;
    }

    /**
     * Claim tokens from one or more settled orders.
     *
     * Token distribution rules (post-settlement):
     *
     *   fundingNotReached = true:
     *     → Full refund of bidding tokens for every order (auction failed).
     *
     *   clearingOrderId = CLEARING_NONE  (initial auction order is clearing price):
     *     → All non-cancelled orders are fully filled at the auctioneer's minimum price.
     *       auctioning received = orderSell * clearingBuyAmount / clearingSellAmount
     *
     *   orderRank < clearingRank  (order is above clearing price):
     *     → Order fully filled at clearing price.
     *       auctioning received = orderSell * clearingBuyAmount / clearingSellAmount
     *
     *   orderId == clearingOrderId  (this IS the clearing order):
     *     → Partial fill. Only volumeClearing bidding tokens are consumed.
     *       auctioning received = volumeClearing * clearingBuyAmount / clearingSellAmount
     *       bidding refunded    = orderSell - volumeClearing
     *
     *   orderRank > clearingRank  (order is below clearing price):
     *     → Full refund of bidding tokens.
     *
     * A cancelled order emits no claim event; it was already refunded at cancellation time.
     *
     * @param auctionId  The auction to claim from.
     * @param orderIds   Array of order IDs owned by the caller to claim.
     * @returns totalAuctioning  Total auctioning tokens sent to caller this call.
     */
    @method(
        { name: 'auctionId', type: ABIDataTypes.UINT256 },
        { name: 'orderIds', type: ABIDataTypes.ARRAY_OF_UINT256 },
    )
    @emit('ClaimedFromOrder')
    @returns({ name: 'totalAuctioning', type: ABIDataTypes.UINT256 })
    public claimFromParticipantOrder(calldata: Calldata): BytesWriter {
        this.lock();

        const auctionId = calldata.readU256();
        const orderIds = calldata.readU256Array();

        this.requireFinished(auctionId);

        const auctioningTokenAddr = u256ToAddr(this.mapAuctioningToken.get(auctionId));
        const biddingTokenAddr = u256ToAddr(this.mapBiddingToken.get(auctionId));
        const clearingBuyAmount = this.mapClearingBuyAmount.get(auctionId);
        const clearingSellAmt = this.mapClearingSellAmt.get(auctionId);
        const clearingOrderId = this.mapClearingOrderId.get(auctionId); // CLEARING_NONE or orderId
        const volumeClearing = this.mapVolumeClearing.get(auctionId);
        const fundingNotReached = !u256.eq(this.mapFundingNotReached.get(auctionId), u256.Zero);

        // clearingRank = mapInterimRank when a bidder order was the clearing order.
        // If CLEARING_NONE, all orders are "above" clearing (fully filled).
        const clearingRank = u256ToU32(this.mapInterimRank.get(auctionId));
        const totalOrders = u256ToU32(this.mapOrderCount.get(auctionId));

        const sender = Blockchain.tx.sender;
        const callerUserId = this.mapAddrToUserId.get(addrToU256(sender));
        if (u256.eq(callerUserId, u256.Zero)) {
            throw new Revert('Opnosis: caller has no registered orders');
        }
        if (orderIds.length > i32(MAX_ORDERS)) {
            throw new Revert('Opnosis: too many order IDs in one call');
        }

        const totalOrderCount = this.mapOrderCount.get(auctionId);

        let totalAuctioning: u256 = u256.Zero;
        let totalBidding: u256 = u256.Zero;

        for (let i = 0; i < orderIds.length; i++) {
            const orderId = orderIds[i];
            // CRITICAL: bounds check prevents cross-auction key collision
            if (orderId >= totalOrderCount) {
                throw new Revert('Opnosis: orderId out of range');
            }
            const key = orderKey(auctionId, orderId);

            // Ownership check.
            if (!u256.eq(this.mapOrderUser.get(key), callerUserId)) {
                throw new Revert('Opnosis: not the order owner');
            }
            // Already-claimed check.
            if (!u256.eq(this.mapClaimed.get(key), u256.Zero)) {
                throw new Revert('Opnosis: order already claimed');
            }

            // Mark claimed immediately (CEI).
            this.mapClaimed.set(key, u256.One);

            // If cancelled: tokens were already returned at cancelSellOrders time.
            if (!u256.eq(this.mapOrderCancelled.get(key), u256.Zero)) {
                // Emit zero-claim event so indexers can confirm the order is closed.
                this.emitEvent(new ClaimedFromOrderEvent(auctionId, callerUserId, u256.Zero, u256.Zero));
                continue;
            }

            const orderSell = this.mapOrderSell.get(key);
            let auctioningAmt: u256 = u256.Zero;
            let biddingAmt: u256 = u256.Zero;

            if (fundingNotReached) {
                // ── Auction failed: full bidding-token refund ─────────────────
                biddingAmt = orderSell;
            } else if (u256.eq(clearingOrderId, CLEARING_NONE)) {
                // ── Initial auction order is clearing price ────────────────────
                // All non-cancelled orders are fully filled at the floor price.
                auctioningAmt = SafeMath.div(
                    SafeMath.mul(orderSell, clearingBuyAmount),
                    clearingSellAmt,
                );
            } else if (u256.eq(orderId, clearingOrderId)) {
                // ── This order IS the clearing order: partial fill ────────────
                auctioningAmt = SafeMath.div(
                    SafeMath.mul(volumeClearing, clearingBuyAmount),
                    clearingSellAmt,
                );
                biddingAmt = SafeMath.sub(orderSell, volumeClearing);
            } else {
                // ── Determine rank to decide above/below clearing ─────────────
                // O(1) lookup via reverse rank map (maintained by insertSorted).
                const orderRank = u256ToU32(this.mapOrderToRank.get(orderKey(auctionId, orderId)));

                if (orderRank < clearingRank) {
                    // Above clearing price: fully filled at clearing price.
                    auctioningAmt = SafeMath.div(
                        SafeMath.mul(orderSell, clearingBuyAmount),
                        clearingSellAmt,
                    );
                } else {
                    // Below (or at same rank as clearing but not the clearing order): full refund.
                    biddingAmt = orderSell;
                }
            }

            totalAuctioning = SafeMath.add(totalAuctioning, auctioningAmt);
            totalBidding = SafeMath.add(totalBidding, biddingAmt);

            this.emitEvent(
                new ClaimedFromOrderEvent(auctionId, callerUserId, auctioningAmt, biddingAmt),
            );
        }

        // ── Interactions ─────────────────────────────────────────────────────
        if (totalAuctioning > u256.Zero) {
            TransferHelper.transfer(auctioningTokenAddr, sender, totalAuctioning);
        }
        if (totalBidding > u256.Zero) {
            TransferHelper.transfer(biddingTokenAddr, sender, totalBidding);
        }

        this.unlock();

        const response = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(totalAuctioning);
        return response;
    }

    // ── Owner-only admin ──────────────────────────────────────────────────────

    /**
     * Update the protocol fee numerator and fee receiver address.
     * Fee = feeNumerator / 1000 of the auctioned amount. Maximum 1.5% (feeNumerator = 15).
     * Only affects future auctions; already-initiated auctions keep their snapshotted fee.
     *
     * Restricted to contract owner.
     */
    @method(
        { name: 'feeNumerator', type: ABIDataTypes.UINT256 },
        { name: 'feeReceiver', type: ABIDataTypes.ADDRESS },
    )
    @emit('FeeParametersUpdated')
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setFeeParameters(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const feeNumerator = calldata.readU256();
        const feeReceiver = calldata.readAddress();

        if (feeNumerator > MAX_FEE_NUMERATOR) {
            throw new Revert('Opnosis: fee exceeds 1.5%');
        }
        if (u256.eq(addrToU256(feeReceiver), u256.Zero)) {
            throw new Revert('Opnosis: zero fee receiver');
        }

        this._globalFeeNum.value = feeNumerator;
        this._feeReceiver.value = addrToU256(feeReceiver);

        this.emitEvent(new FeeParametersUpdatedEvent(feeNumerator, feeReceiver));

        const response = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        response.writeBoolean(true);
        return response;
    }

    // ── Read-only queries ─────────────────────────────────────────────────────

    /**
     * Look up the userId for a given address.
     * Returns 0 if the address has not yet placed any orders.
     */
    @method({ name: 'userAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'userId', type: ABIDataTypes.UINT256 })
    public getUserId(calldata: Calldata): BytesWriter {
        const addr = calldata.readAddress();
        const userId = this.mapAddrToUserId.get(addrToU256(addr));

        const response = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(userId);
        return response;
    }

    /**
     * Return core auction data for the given auctionId.
     * Fields (in order): auctioningToken, biddingToken, orderPlacementStartDate,
     *   cancellationEndDate, auctionEndDate, auctionedSellAmount, minBuyAmount, minBidPerOrder,
     *   feeNumerator, minFundingThreshold, isAtomicClosureAllowed, orderCount, settled,
     *   fundingNotReached.
     */
    @method({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'auctioningToken', type: ABIDataTypes.ADDRESS })
    public getAuctionData(calldata: Calldata): BytesWriter {
        const auctionId = calldata.readU256();

        if (u256.eq(this.mapSellAmount.get(auctionId), u256.Zero)) {
            throw new Revert('Opnosis: auction does not exist');
        }

        const response = new BytesWriter(
            ADDRESS_BYTE_LENGTH + // auctioningToken
            ADDRESS_BYTE_LENGTH + // biddingToken
            U256_BYTE_LENGTH +    // orderPlacementStartDate
            U256_BYTE_LENGTH +    // cancellationEndDate
            U256_BYTE_LENGTH +    // auctionEndDate
            U256_BYTE_LENGTH +    // auctionedSellAmount
            U256_BYTE_LENGTH +    // minBuyAmount
            U256_BYTE_LENGTH +    // minBidPerOrder
            U256_BYTE_LENGTH +    // feeNumerator
            U256_BYTE_LENGTH +    // minFundingThreshold
            BOOLEAN_BYTE_LENGTH + // isAtomicClosureAllowed
            U256_BYTE_LENGTH +    // orderCount
            BOOLEAN_BYTE_LENGTH + // settled
            BOOLEAN_BYTE_LENGTH   // fundingNotReached
        );

        response.writeAddress(u256ToAddr(this.mapAuctioningToken.get(auctionId)));
        response.writeAddress(u256ToAddr(this.mapBiddingToken.get(auctionId)));
        response.writeU256(this.mapOrderPlacementStart.get(auctionId));
        response.writeU256(this.mapCancellationEnd.get(auctionId));
        response.writeU256(this.mapAuctionEnd.get(auctionId));
        response.writeU256(this.mapSellAmount.get(auctionId));
        response.writeU256(this.mapMinBuyAmount.get(auctionId));
        response.writeU256(this.mapMinBidPerOrder.get(auctionId));
        response.writeU256(this.mapAuctionFeeNum.get(auctionId));
        response.writeU256(this.mapMinFunding.get(auctionId));
        response.writeBoolean(!u256.eq(this.mapIsAtomic.get(auctionId), u256.Zero));
        response.writeU256(this.mapOrderCount.get(auctionId));
        response.writeBoolean(!u256.eq(this.mapSettled.get(auctionId), u256.Zero));
        response.writeBoolean(!u256.eq(this.mapFundingNotReached.get(auctionId), u256.Zero));

        return response;
    }

    /**
     * Return the clearing price and settlement volume for a settled auction.
     * Fields: clearingBuyAmount, clearingSellAmount, volumeClearingPriceOrder,
     *         bidRaised, clearingOrderId (u256.Max = initial auction order).
     */
    @method({ name: 'auctionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'clearingBuyAmount', type: ABIDataTypes.UINT256 })
    public getClearingOrder(calldata: Calldata): BytesWriter {
        const auctionId = calldata.readU256();
        this.requireFinished(auctionId);

        const response = new BytesWriter(U256_BYTE_LENGTH * 5);
        response.writeU256(this.mapClearingBuyAmount.get(auctionId));
        response.writeU256(this.mapClearingSellAmt.get(auctionId));
        response.writeU256(this.mapVolumeClearing.get(auctionId));
        response.writeU256(this.mapBidRaised.get(auctionId));
        response.writeU256(this.mapClearingOrderId.get(auctionId));
        return response;
    }

    /**
     * Return the current global fee parameters.
     * Fields: feeNumerator (out of 1000), feeReceiverAddress.
     */
    @method()
    @returns({ name: 'feeNumerator', type: ABIDataTypes.UINT256 })
    public getFeeParameters(_: Calldata): BytesWriter {
        const response = new BytesWriter(U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH);
        response.writeU256(this._globalFeeNum.value);
        response.writeAddress(u256ToAddr(this._feeReceiver.value));
        return response;
    }
}
