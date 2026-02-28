/**
 * Auction indexer — polls the Opnosis contract for auction data.
 */

import { getContract, OP_20_ABI } from 'opnet';
import type { AbstractRpcProvider, TransactionParameters } from 'opnet';
import type { Network } from '@btc-vision/bitcoin';
import { OpnosisContract, getAuctionStatus } from '@opnosis/shared';
import type { AuctionStatus } from '@opnosis/shared';
import { Cache } from './cache.js';
import { getTokenUsdPrice, initPriceFeed } from './pricefeed.js';

export interface IndexedAuction {
    readonly id: string;
    readonly auctioningToken: string;
    readonly auctioningTokenName: string;
    readonly auctioningTokenSymbol: string;
    readonly biddingToken: string;
    readonly biddingTokenName: string;
    readonly biddingTokenSymbol: string;
    readonly orderPlacementStartDate: string;
    readonly auctionEndDate: string;
    readonly cancellationEndDate: string;
    readonly auctionedSellAmount: string;
    readonly minBuyAmount: string;
    readonly minimumBiddingAmountPerOrder: string;
    readonly minFundingThreshold: string;
    readonly isAtomicClosureAllowed: boolean;
    readonly orderCount: string;
    readonly totalBidAmount: string;
    readonly isSettled: boolean;
    readonly status: AuctionStatus;
    readonly auctioningTokenDecimals: number;
    readonly biddingTokenDecimals: number;
    readonly auctioneerAddress: string;
    readonly hasCancelWindow: boolean;
    readonly fundingNotReached: boolean;
}

export interface IndexedClearing {
    readonly clearingBuyAmount: string;
    readonly clearingSellAmount: string;
}

export interface IndexedOrder {
    readonly orderId: number;
    readonly buyAmount: string;
    readonly sellAmount: string;
    readonly userId: string;
    readonly userAddress: string;
    readonly cancelled: boolean;
    readonly claimed: boolean;
}

export interface AuctionStats {
    readonly totalAuctions: number;
    readonly settledAuctions: number;
    readonly openAuctions: number;
    readonly upcomingAuctions: number;
    readonly failedAuctions: number;
    readonly totalRaisedUsd: string;
    readonly totalOrdersPlaced: number;
}

const auctions = new Map<number, IndexedAuction>();
const clearings = new Map<number, IndexedClearing>();
let highestKnownId = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Auto-settle state
const settleAttempted = new Set<number>();
let _txParams: TransactionParameters | null = null;

// Token metadata cache
const tokenNames = new Map<string, string>();
const tokenSymbols = new Map<string, string>();
const tokenDecimals = new Map<string, number>();
let _provider: AbstractRpcProvider | null = null;
let _network: Network | null = null;

async function resolveTokenName(address: string): Promise<string> {
    if (tokenNames.has(address)) return tokenNames.get(address)!;
    if (!_provider || !_network) return 'Unknown';
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const token = getContract(address, OP_20_ABI, _provider, _network) as any;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const result = await token.name();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const name = String(result?.properties?.name ?? 'Unknown');
        tokenNames.set(address, name);
        return name;
    } catch {
        tokenNames.set(address, 'Unknown');
        return 'Unknown';
    }
}

async function resolveTokenSymbol(address: string): Promise<string> {
    if (tokenSymbols.has(address)) return tokenSymbols.get(address)!;
    if (!_provider || !_network) return '???';
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const token = getContract(address, OP_20_ABI, _provider, _network) as any;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const result = await token.symbol();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const sym = String(result?.properties?.symbol ?? '???');
        tokenSymbols.set(address, sym);
        return sym;
    } catch {
        tokenSymbols.set(address, '???');
        return '???';
    }
}

async function resolveTokenDecimals(address: string): Promise<number> {
    if (tokenDecimals.has(address)) return tokenDecimals.get(address)!;
    if (!_provider || !_network) return 18;
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const token = getContract(address, OP_20_ABI, _provider, _network) as any;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const result = await token.decimals();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const dec = Number(result?.properties?.decimals ?? 18);
        tokenDecimals.set(address, dec);
        return dec;
    } catch {
        tokenDecimals.set(address, 18);
        return 18;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseAuctionResult(auctionId: number, raw: any, blockTimeMs?: bigint): Promise<IndexedAuction | null> {
    try {
        // The opnet SDK decodes outputs into `properties` (not `result`)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const r = raw?.properties;
        if (!r) return null;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const auctioningToken = String(r.auctioningToken ?? '');
        if (!auctioningToken) return null;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const biddingToken = String(r.biddingToken ?? '');

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const orderPlacementStartDate = BigInt(r.orderPlacementStartDate ?? 0);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const auctionEndDate = BigInt(r.auctionEndDate ?? 0);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const cancellationEndDate = BigInt(r.cancellationEndDate ?? 0);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const isSettled = Boolean(r.isSettled ?? false);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const fundingNotReached = Boolean(r.fundingNotReached ?? false);

        // The SDK only decodes 14 fields from getAuctionData; the 15th field
        // (auctioneerAddress) is in the raw BinaryReader at byte offset 355.
        // Layout: 2 addr(64) + 9 u256(288) + 3 bool(3) = 355, then 1 addr(32).
        let auctioneerAddress = '';
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const reader = raw?.result;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (reader && typeof reader.setOffset === 'function' && reader.buffer?.byteLength >= 387) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                reader.setOffset(355);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                const addr = reader.readAddress();
                const addrStr = String(addr ?? '');
                if (addrStr && addrStr !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                    auctioneerAddress = addrStr;
                }
            }
        } catch {
            // Fallback: auctioneerAddress stays empty
        }

        const status = getAuctionStatus(cancellationEndDate, auctionEndDate, isSettled, blockTimeMs, orderPlacementStartDate);

        // Cancel window exists if the cancellation end is meaningfully between
        // the order start and the auction end. When start is 0, check that
        // the cancel-to-end gap is less than 90% of the total auction duration
        // (otherwise the cancel window was essentially zero / set to creation time).
        const effectiveStart = orderPlacementStartDate > 0n ? orderPlacementStartDate : cancellationEndDate;
        const auctionDuration = auctionEndDate > effectiveStart ? auctionEndDate - effectiveStart : 1n;
        const noCancelGap = auctionEndDate - cancellationEndDate;
        const hasCancelWindow = cancellationEndDate > 0n
            && cancellationEndDate < auctionEndDate
            && (orderPlacementStartDate > 0n
                ? cancellationEndDate > orderPlacementStartDate
                : noCancelGap < auctionDuration * 90n / 100n);

        const [auctioningTokenName, auctioningTokenSymbol, biddingTokenName, biddingTokenSymbol, auctioningTokenDecimals, biddingTokenDecimals] = await Promise.all([
            resolveTokenName(auctioningToken),
            resolveTokenSymbol(auctioningToken),
            resolveTokenName(biddingToken),
            resolveTokenSymbol(biddingToken),
            resolveTokenDecimals(auctioningToken),
            resolveTokenDecimals(biddingToken),
        ]);

        return {
            id: auctionId.toString(),
            auctioningToken,
            auctioningTokenName,
            auctioningTokenSymbol,
            biddingToken,
            biddingTokenName,
            biddingTokenSymbol,
            orderPlacementStartDate: orderPlacementStartDate.toString(),
            auctionEndDate: auctionEndDate.toString(),
            cancellationEndDate: cancellationEndDate.toString(),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            auctionedSellAmount: String(r.auctionedSellAmount ?? '0'),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            minBuyAmount: String(r.minBuyAmount ?? '0'),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            minimumBiddingAmountPerOrder: String(r.minimumBiddingAmountPerOrder ?? '0'),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            minFundingThreshold: String(r.minFundingThreshold ?? '0'),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            isAtomicClosureAllowed: Boolean(r.isAtomicClosureAllowed ?? false),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            orderCount: String(r.orderCount ?? '0'),
            totalBidAmount: '0',
            isSettled,
            status,
            auctioningTokenDecimals,
            biddingTokenDecimals,
            auctioneerAddress,
            hasCancelWindow,
            fundingNotReached,
        };
    } catch {
        return null;
    }
}

/** Maximum number of consecutive auction IDs to probe ahead per poll cycle. */
const MAX_PROBE_AHEAD = 50;

async function pollOnce(contract: OpnosisContract, cache: Cache): Promise<void> {
    // Fetch blockchain time for accurate status computation (can be hours ahead of wall clock)
    let blockTimeMs = BigInt(Date.now());
    try {
        if (_provider) {
            const bn = await _provider.getBlockNumber();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const block = await _provider.getBlock(bn) as any;
            // Use block.time (latest block timestamp) rather than medianTime which lags
            // behind by several blocks. This provides more accurate status for UI.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const t = BigInt(block.time ?? block.medianTime ?? 0);
            if (t > 0n) blockTimeMs = t;
        }
    } catch { /* fall back to Date.now() */ }

    // Discover new auctions (bounded to MAX_PROBE_AHEAD to prevent infinite loops)
    let probeId = highestKnownId + 1;
    const probeLimit = highestKnownId + 1 + MAX_PROBE_AHEAD;
    for (; probeId <= probeLimit;) {
        try {
            const raw = await contract.getAuctionData(BigInt(probeId));
            const parsed = await parseAuctionResult(probeId, raw, blockTimeMs);
            if (!parsed) break;
            auctions.set(probeId, parsed);
            cache.invalidate(`auction:${probeId}`);
            highestKnownId = probeId;
            probeId++;
        } catch (err) {
            if (probeId === highestKnownId + 1) {
                // First probe failed — likely no new auctions (normal)
            } else {
                console.warn(`Indexer: error probing auction ${probeId}:`, err);
            }
            break;
        }
    }

    // Refresh unsettled auctions
    for (const [id, auction] of auctions) {
        if (auction.isSettled) continue;
        try {
            const raw = await contract.getAuctionData(BigInt(id));
            const parsed = await parseAuctionResult(id, raw, blockTimeMs);
            if (parsed) {
                auctions.set(id, parsed);
                cache.invalidate(`auction:${id}`);
            }
        } catch (err) {
            console.warn(`Indexer: error refreshing auction ${id}:`, err);
        }
    }

    // Fetch clearing data for settled auctions that we haven't cached yet
    for (const [id, auction] of auctions) {
        if (!auction.isSettled || clearings.has(id)) continue;
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const raw = await contract.getClearingOrder(BigInt(id));
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const r = raw?.properties;
            if (r) {
                clearings.set(id, {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    clearingBuyAmount: String(r.clearingBuyAmount ?? '0'),
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    clearingSellAmount: String(r.clearingSellAmount ?? '0'),
                });
            }
        } catch (err) {
            console.warn(`Indexer: error fetching clearing for auction ${id}:`, err);
        }
    }

    // Invalidate order cache when order count changes (new bids) or
    // for settled auctions with unclaimed orders (claim/cancel state).
    for (const [id, auction] of auctions) {
        const orderCount = Number(auction.orderCount);
        if (orderCount === 0) continue;
        const cacheKey = `orders:${id}`;
        const cached = cache.get<IndexedOrder[]>(cacheKey);
        if (!cached) continue;
        if (cached.length !== orderCount) {
            cache.invalidate(cacheKey);
        } else if (auction.isSettled && cached.some((o) => !o.cancelled && !o.claimed)) {
            cache.invalidate(cacheKey);
        }
    }

    // Compute totalBidAmount for auctions with orders
    for (const [id, auction] of auctions) {
        if (auction.totalBidAmount !== '0' && auction.isSettled) continue; // settled totals are frozen
        const orderCount = Number(auction.orderCount);
        if (orderCount === 0) continue;
        try {
            const orders = await getOrdersData(contract, cache, id);
            if (orders) {
                let total = 0n;
                for (const o of orders) {
                    if (!o.cancelled) total += BigInt(o.sellAmount);
                }
                auctions.set(id, { ...auction, totalBidAmount: total.toString() });
            }
        } catch {
            // totalBidAmount stays at previous value
        }
    }

    // Auto-settle ended auctions (one attempt per auction)
    if (_txParams) {
        for (const [id, auction] of auctions) {
            if (auction.isSettled || auction.status !== 'ended') continue;
            if (settleAttempted.has(id)) continue;
            settleAttempted.add(id);
            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const sim = await contract.simulateSettle(BigInt(id));
                if ('error' in (sim as object)) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    console.warn(`Auto-settle auction ${id} simulation error:`, sim.error);
                    continue;
                }
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                await sim.sendTransaction(_txParams);
                console.log(`Auto-settled auction ${id}`);
            } catch (err) {
                console.warn(`Auto-settle auction ${id} failed:`, err);
            }
        }
    }
}

export function startIndexer(
    contract: OpnosisContract,
    cache: Cache,
    intervalMs: number,
    provider: AbstractRpcProvider,
    network: Network,
    txParams?: TransactionParameters | null,
): void {
    if (pollTimer) return;
    _provider = provider;
    _network = network;
    _txParams = txParams ?? null;
    initPriceFeed();
    // Initial poll
    void pollOnce(contract, cache);
    pollTimer = setInterval(() => void pollOnce(contract, cache), intervalMs);
}

export function getAuctions(): IndexedAuction[] {
    return Array.from(auctions.values());
}

export function getAuction(id: number): IndexedAuction | undefined {
    return auctions.get(id);
}

export async function getStats(): Promise<AuctionStats> {
    let settledAuctions = 0;
    let openAuctions = 0;
    let upcomingAuctions = 0;
    let failedAuctions = 0;
    let totalRaisedUsd = 0;
    let totalOrdersPlaced = 0;

    // Collect settled auctions that need price lookups
    const priceTasks: { raised: number; tokenAddress: string }[] = [];

    for (const [id, auction] of auctions) {
        totalOrdersPlaced += Number(auction.orderCount);
        if (auction.status === 'settled') {
            settledAuctions++;
            // Use clearing data to compute actual raised (clearing price × tokens sold)
            // totalBidAmount includes excess that gets refunded to bidders
            const clearing = clearings.get(id);
            if (clearing) {
                const sellAmt = BigInt(auction.auctionedSellAmount);
                const clearBuy = BigInt(clearing.clearingBuyAmount);
                const clearSell = BigInt(clearing.clearingSellAmount);
                // raised = auctionedSellAmount * (clearingSellAmount / clearingBuyAmount)
                const raisedTokens = sellAmt * clearSell / clearBuy;
                priceTasks.push({
                    raised: Number(raisedTokens) / (10 ** auction.biddingTokenDecimals),
                    tokenAddress: auction.biddingToken,
                });
            } else {
                // Fallback to totalBidAmount if clearing not available
                const totalBid = BigInt(auction.totalBidAmount || '0');
                if (totalBid > 0n) {
                    priceTasks.push({
                        raised: Number(totalBid) / (10 ** auction.biddingTokenDecimals),
                        tokenAddress: auction.biddingToken,
                    });
                }
            }
        } else if (auction.status === 'upcoming') {
            upcomingAuctions++;
        } else if (auction.status === 'open' || auction.status === 'cancellation_closed') {
            openAuctions++;
        } else if (auction.status === 'ended') {
            // ended but not settled — could still be settled or could fail
        } else {
            failedAuctions++;
        }
    }

    // Fetch USD prices in parallel for all settled auctions
    if (priceTasks.length > 0) {
        const prices = await Promise.all(
            priceTasks.map((t) => getTokenUsdPrice(t.tokenAddress)),
        );
        for (let i = 0; i < priceTasks.length; i++) {
            const task = priceTasks[i]!;
            const price = prices[i]!;
            totalRaisedUsd += task.raised * price;
        }
    }

    return {
        totalAuctions: auctions.size,
        settledAuctions,
        openAuctions,
        upcomingAuctions,
        failedAuctions,
        totalRaisedUsd: totalRaisedUsd.toFixed(2),
        totalOrdersPlaced,
    };
}

export async function getOrdersData(
    contract: OpnosisContract,
    cache: Cache,
    auctionId: number,
): Promise<IndexedOrder[] | null> {
    const cacheKey = `orders:${auctionId}`;
    const cached = cache.get<IndexedOrder[]>(cacheKey);
    if (cached) return cached;

    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const raw = await contract.getAuctionOrders(BigInt(auctionId));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const reader = raw?.result;
        if (!reader) return null;

        // The SDK decodes ABI outputs and advances the reader offset.
        // Reset to 0 so we can read the full binary response from the start.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        if (typeof reader.setOffset === 'function') reader.setOffset(0);

        // First u256 = orderCount
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const orderCount = Number(reader.readU256() as bigint);

        const orders: IndexedOrder[] = [];
        const userAddressCache = new Map<string, string>();

        for (let i = 0; i < orderCount; i++) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const buyAmount = String(reader.readU256() as bigint);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const sellAmount = String(reader.readU256() as bigint);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const userId = String(reader.readU256() as bigint);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const cancelled = reader.readBoolean() as boolean;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const claimed = reader.readBoolean() as boolean;

            // Resolve userId → address (cache to avoid repeated RPC calls)
            let userAddress = userAddressCache.get(userId);
            if (userAddress === undefined) {
                try {
                    userAddress = await contract.getUserAddress(BigInt(userId));
                } catch {
                    userAddress = '';
                }
                userAddressCache.set(userId, userAddress);
            }

            orders.push({ orderId: i, buyAmount, sellAmount, userId, userAddress, cancelled, claimed });
        }

        cache.set(cacheKey, orders);
        return orders;
    } catch {
        return null;
    }
}

export async function getClearingData(
    contract: OpnosisContract,
    cache: Cache,
    auctionId: number,
): Promise<IndexedClearing | null> {
    const cacheKey = `clearing:${auctionId}`;
    const cached = cache.get<IndexedClearing>(cacheKey);
    if (cached) return cached;

    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const raw = await contract.getClearingOrder(BigInt(auctionId));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const r = raw?.properties;
        if (!r) return null;
        const data: IndexedClearing = {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            clearingBuyAmount: String(r.clearingBuyAmount ?? '0'),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            clearingSellAmount: String(r.clearingSellAmount ?? '0'),
        };
        cache.set(cacheKey, data);
        return data;
    } catch {
        return null;
    }
}
