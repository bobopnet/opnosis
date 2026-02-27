/**
 * Auction indexer — polls the Opnosis contract for auction data.
 */

import { getContract, OP_20_ABI } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
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
    readonly auctioneerAddress: string;
}

export interface IndexedClearing {
    readonly clearingBuyAmount: string;
    readonly clearingSellAmount: string;
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

// Token metadata cache
const tokenNames = new Map<string, string>();
const tokenSymbols = new Map<string, string>();
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseAuctionResult(auctionId: number, raw: any): Promise<IndexedAuction | null> {
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

        const status = getAuctionStatus(cancellationEndDate, auctionEndDate, isSettled, undefined, orderPlacementStartDate);

        const [auctioningTokenName, auctioningTokenSymbol, biddingTokenName, biddingTokenSymbol] = await Promise.all([
            resolveTokenName(auctioningToken),
            resolveTokenSymbol(auctioningToken),
            resolveTokenName(biddingToken),
            resolveTokenSymbol(biddingToken),
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
            auctioneerAddress,
        };
    } catch {
        return null;
    }
}

/** Maximum number of consecutive auction IDs to probe ahead per poll cycle. */
const MAX_PROBE_AHEAD = 50;

async function pollOnce(contract: OpnosisContract, cache: Cache): Promise<void> {
    // Discover new auctions (bounded to MAX_PROBE_AHEAD to prevent infinite loops)
    let probeId = highestKnownId + 1;
    const probeLimit = highestKnownId + 1 + MAX_PROBE_AHEAD;
    for (; probeId <= probeLimit;) {
        try {
            const raw = await contract.getAuctionData(BigInt(probeId));
            const parsed = await parseAuctionResult(probeId, raw);
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
            const parsed = await parseAuctionResult(id, raw);
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
}

export function startIndexer(
    contract: OpnosisContract,
    cache: Cache,
    intervalMs: number,
    provider: AbstractRpcProvider,
    network: Network,
): void {
    if (pollTimer) return;
    _provider = provider;
    _network = network;
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
            const clearing = clearings.get(id);
            if (clearing) {
                const sellAmount = BigInt(auction.auctionedSellAmount);
                const clearingBuy = BigInt(clearing.clearingBuyAmount);
                const clearingSell = BigInt(clearing.clearingSellAmount);
                if (clearingSell > 0n) {
                    const raised = sellAmount * clearingBuy / clearingSell;
                    priceTasks.push({
                        raised: Number(raised) / 1e8,
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

export interface IndexedOrder {
    readonly orderId: number;
    readonly buyAmount: string;
    readonly sellAmount: string;
    readonly userId: string;
    readonly userAddress: string;
    readonly cancelled: boolean;
    readonly claimed: boolean;
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
