/**
 * Auction indexer — polls the Opnosis contract for auction data.
 */

import { OpnosisContract, getAuctionStatus } from '@opnosis/shared';
import type { AuctionStatus } from '@opnosis/shared';
import { Cache } from './cache.js';

export interface IndexedAuction {
    readonly id: string;
    readonly auctioningToken: string;
    readonly biddingToken: string;
    readonly auctionEndDate: string;
    readonly cancellationEndDate: string;
    readonly auctionedSellAmount: string;
    readonly minBuyAmount: string;
    readonly minimumBiddingAmountPerOrder: string;
    readonly minFundingThreshold: string;
    readonly isAtomicClosureAllowed: boolean;
    readonly orderCount: string;
    readonly isSettled: boolean;
    readonly status: AuctionStatus;
}

export interface IndexedClearing {
    readonly clearingBuyAmount: string;
    readonly clearingSellAmount: string;
}

export interface AuctionStats {
    readonly totalAuctions: number;
    readonly settledAuctions: number;
    readonly openAuctions: number;
    readonly failedAuctions: number;
    readonly totalVolume: string;
    readonly totalOrdersPlaced: number;
}

const auctions = new Map<number, IndexedAuction>();
let highestKnownId = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAuctionResult(auctionId: number, raw: any): IndexedAuction | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const r = raw?.result;
        if (!r) return null;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const auctioningToken = String(r.auctioningToken ?? '');
        if (!auctioningToken) return null;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const auctionEndDate = BigInt(r.auctionEndDate ?? 0);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const cancellationEndDate = BigInt(r.cancellationEndDate ?? 0);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const isSettled = Boolean(r.isSettled ?? false);

        const status = getAuctionStatus(cancellationEndDate, auctionEndDate, isSettled);

        return {
            id: auctionId.toString(),
            auctioningToken,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            biddingToken: String(r.biddingToken ?? ''),
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
            isSettled,
            status,
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
            const parsed = parseAuctionResult(probeId, raw);
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
            const parsed = parseAuctionResult(id, raw);
            if (parsed) {
                auctions.set(id, parsed);
                cache.invalidate(`auction:${id}`);
            }
        } catch (err) {
            console.warn(`Indexer: error refreshing auction ${id}:`, err);
        }
    }
}

export function startIndexer(contract: OpnosisContract, cache: Cache, intervalMs: number): void {
    if (pollTimer) return;
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

export function getStats(): AuctionStats {
    let settledAuctions = 0;
    let openAuctions = 0;
    let failedAuctions = 0;
    let totalVolume = 0n;
    let totalOrdersPlaced = 0;

    for (const auction of auctions.values()) {
        totalVolume += BigInt(auction.auctionedSellAmount);
        totalOrdersPlaced += Number(auction.orderCount);
        if (auction.status === 'settled') {
            settledAuctions++;
        } else if (auction.status === 'open' || auction.status === 'cancellation_closed') {
            openAuctions++;
        } else if (auction.status === 'ended') {
            // ended but not settled — could still be settled or could fail
            // Count as neither open nor failed yet
        } else {
            failedAuctions++;
        }
    }

    return {
        totalAuctions: auctions.size,
        settledAuctions,
        openAuctions,
        failedAuctions,
        totalVolume: totalVolume.toString(),
        totalOrdersPlaced,
    };
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
        const r = raw?.result;
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
