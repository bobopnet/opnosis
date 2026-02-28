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

// Typed interfaces for opnet SDK return values (avoids `as any`)
interface OP20StringResult {
    properties: { name?: string; symbol?: string; [key: string]: unknown };
}

interface OP20DecimalsResult {
    properties: { decimals?: number; [key: string]: unknown };
}

interface OP20Contract {
    name(): Promise<OP20StringResult>;
    symbol(): Promise<OP20StringResult>;
    decimals(): Promise<OP20DecimalsResult>;
}

interface BinaryReader {
    setOffset(offset: number): void;
    readAddress(): unknown;
    readU256(): bigint;
    readBoolean(): boolean;
    buffer: ArrayBuffer;
}

interface AuctionDataResult {
    properties: {
        auctioningToken?: string;
        biddingToken?: string;
        orderPlacementStartDate?: bigint;
        auctionEndDate?: bigint;
        cancellationEndDate?: bigint;
        isSettled?: boolean;
        fundingNotReached?: boolean;
        auctionedSellAmount?: string;
        minBuyAmount?: string;
        minimumBiddingAmountPerOrder?: string;
        minFundingThreshold?: string;
        isAtomicClosureAllowed?: boolean;
        orderCount?: string;
        [key: string]: unknown;
    };
    result?: BinaryReader;
}

interface BlockResult {
    time?: number;
    medianTime?: number;
}

interface ClearingResult {
    properties: {
        clearingBuyAmount?: string;
        clearingSellAmount?: string;
        [key: string]: unknown;
    };
}

interface OrdersResult {
    result?: BinaryReader;
}

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

// Auto-settle / auto-refund state
const settleAttempted = new Set<number>();
const settleRetries = new Map<number, number>();
const refundAttempted = new Set<number>();
const refundRetries = new Map<number, number>();
const MAX_SETTLE_RETRIES = 10;
const MAX_REFUND_RETRIES = 10;
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
        const token = getContract(address, OP_20_ABI, _provider, _network) as unknown as OP20Contract;
        const result = await token.name();
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
        const token = getContract(address, OP_20_ABI, _provider, _network) as unknown as OP20Contract;
        const result = await token.symbol();
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
        const token = getContract(address, OP_20_ABI, _provider, _network) as unknown as OP20Contract;
        const result = await token.decimals();
        const dec = Number(result?.properties?.decimals ?? 18);
        tokenDecimals.set(address, dec);
        return dec;
    } catch {
        tokenDecimals.set(address, 18);
        return 18;
    }
}

async function parseAuctionResult(auctionId: number, raw: AuctionDataResult, blockTimeMs?: bigint): Promise<IndexedAuction | null> {
    try {
        const r = raw?.properties;
        if (!r) return null;
        const auctioningToken = String(r.auctioningToken ?? '');
        if (!auctioningToken) return null;
        const biddingToken = String(r.biddingToken ?? '');

        const orderPlacementStartDate = BigInt(r.orderPlacementStartDate ?? 0);
        const auctionEndDate = BigInt(r.auctionEndDate ?? 0);
        const cancellationEndDate = BigInt(r.cancellationEndDate ?? 0);
        const isSettled = Boolean(r.isSettled ?? false);
        const fundingNotReached = Boolean(r.fundingNotReached ?? false);

        // The SDK only decodes 14 fields from getAuctionData; the 15th field
        // (auctioneerAddress) is in the raw BinaryReader at byte offset 355.
        // Layout: 2 addr(64) + 9 u256(288) + 3 bool(3) = 355, then 1 addr(32).
        let auctioneerAddress = '';
        try {
            const reader = raw?.result;
            if (reader && typeof reader.setOffset === 'function' && reader.buffer?.byteLength >= 387) {
                reader.setOffset(355);
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

        // Cancel window exists if cancellationEndDate is set, before auction end,
        // and at least 1 minute (60_000 ms) before auction end (to filter out
        // zero-window auctions where cancel end was set to creation time).
        const hasCancelWindow = cancellationEndDate > 0n
            && cancellationEndDate < auctionEndDate
            && (auctionEndDate - cancellationEndDate) >= 60_000n;

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
            auctionedSellAmount: String(r.auctionedSellAmount ?? '0'),
            minBuyAmount: String(r.minBuyAmount ?? '0'),
            minimumBiddingAmountPerOrder: String(r.minimumBiddingAmountPerOrder ?? '0'),
            minFundingThreshold: String(r.minFundingThreshold ?? '0'),
            isAtomicClosureAllowed: Boolean(r.isAtomicClosureAllowed ?? false),
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
            const block = await _provider.getBlock(bn) as unknown as BlockResult;
            // Use block.time (latest block timestamp) rather than medianTime which lags
            // behind by several blocks. This provides more accurate status for UI.
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
            const raw = await contract.getClearingOrder(BigInt(id)) as unknown as ClearingResult;
            const r = raw?.properties;
            if (r) {
                clearings.set(id, {
                    clearingBuyAmount: String(r.clearingBuyAmount ?? '0'),
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
            const sRetries = settleRetries.get(id) ?? 0;
            if (sRetries >= MAX_SETTLE_RETRIES) {
                settleAttempted.add(id);
                console.warn(`Auto-settle auction ${id}: giving up after ${MAX_SETTLE_RETRIES} retries`);
                continue;
            }
            try {
                const sim = await contract.simulateSettle(BigInt(id));
                if ('error' in (sim as object)) {
                    const errSim = sim as { error: string };
                    console.warn(`Auto-settle auction ${id} simulation error (attempt ${sRetries + 1}):`, errSim.error);
                    settleRetries.set(id, sRetries + 1);
                    continue;
                }
                const sendable = sim as { sendTransaction(params: TransactionParameters): Promise<unknown> };
                await sendable.sendTransaction(_txParams);
                console.log(`Auto-settled auction ${id}`);
                settleAttempted.add(id); // Success — mark done
            } catch (err) {
                console.warn(`Auto-settle auction ${id} failed (attempt ${sRetries + 1}):`, err);
                settleRetries.set(id, sRetries + 1);
            }
        }

        // Auto-distribute tokens for all settled auctions.
        // The contract sends tokens directly to each order owner — anyone can
        // trigger claims. Winners receive auctioning tokens, losers and failed
        // auction bidders receive bidding token refunds.
        for (const [id, auction] of auctions) {
            if (!auction.isSettled) continue;
            if (refundAttempted.has(id)) continue;
            const retries = refundRetries.get(id) ?? 0;
            if (retries >= MAX_REFUND_RETRIES) {
                refundAttempted.add(id);
                console.warn(`Auto-distribute auction ${id}: giving up after ${MAX_REFUND_RETRIES} retries`);
                continue;
            }
            try {
                const orders = await getOrdersData(contract, cache, id);
                if (!orders) { refundRetries.set(id, retries + 1); continue; }
                const claimable = orders.filter((o) => !o.cancelled && !o.claimed);
                if (claimable.length === 0) {
                    refundAttempted.add(id); // All already claimed — done
                    continue;
                }
                const orderIds = claimable.map((o) => BigInt(o.orderId));
                const sim = await contract.simulateClaimFromParticipantOrder(BigInt(id), orderIds);
                if ('error' in (sim as object)) {
                    const errSim = sim as { error: string };
                    console.warn(`Auto-distribute auction ${id} simulation error (attempt ${retries + 1}):`, errSim.error);
                    refundRetries.set(id, retries + 1);
                    continue;
                }
                const sendable = sim as { sendTransaction(params: TransactionParameters): Promise<unknown> };
                await sendable.sendTransaction(_txParams);
                console.log(`Auto-distributed tokens for ${claimable.length} orders in auction ${id}`);
                refundAttempted.add(id); // Success — mark done
                cache.invalidate(`orders:${id}`);
            } catch (err) {
                console.warn(`Auto-distribute auction ${id} failed (attempt ${retries + 1}):`, err);
                refundRetries.set(id, retries + 1);
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

export async function getTokenInfo(address: string): Promise<{ name: string; symbol: string; decimals: number }> {
    const [name, symbol, decimals] = await Promise.all([
        resolveTokenName(address),
        resolveTokenSymbol(address),
        resolveTokenDecimals(address),
    ]);
    return { name, symbol, decimals };
}

export function getAuctions(): IndexedAuction[] {
    return Array.from(auctions.values());
}

export function getAuction(id: number): IndexedAuction | undefined {
    return auctions.get(id);
}

/** Return the latest blockchain timestamp in milliseconds. */
export async function getBlockTime(): Promise<string> {
    try {
        if (_provider) {
            const bn = await _provider.getBlockNumber();
            const block = await _provider.getBlock(bn) as unknown as BlockResult;
            const t = BigInt(block.time ?? block.medianTime ?? 0);
            if (t > 0n) return t.toString();
        }
    } catch { /* fall back */ }
    return String(Date.now());
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
        const raw = await contract.getAuctionOrders(BigInt(auctionId)) as unknown as OrdersResult;
        const reader = raw?.result;
        if (!reader) return null;

        // The SDK decodes ABI outputs and advances the reader offset.
        // Reset to 0 so we can read the full binary response from the start.
        if (typeof reader.setOffset === 'function') reader.setOffset(0);

        // First u256 = orderCount
        const orderCount = Number(reader.readU256());

        const orders: IndexedOrder[] = [];
        const userAddressCache = new Map<string, string>();

        for (let i = 0; i < orderCount; i++) {
            const buyAmount = String(reader.readU256());
            const sellAmount = String(reader.readU256());
            const userId = String(reader.readU256());
            const cancelled = reader.readBoolean();
            const claimed = reader.readBoolean();

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
        const raw = await contract.getClearingOrder(BigInt(auctionId)) as unknown as ClearingResult;
        const r = raw?.properties;
        if (!r) return null;
        const data: IndexedClearing = {
            clearingBuyAmount: String(r.clearingBuyAmount ?? '0'),
            clearingSellAmount: String(r.clearingSellAmount ?? '0'),
        };
        cache.set(cacheKey, data);
        return data;
    } catch {
        return null;
    }
}
