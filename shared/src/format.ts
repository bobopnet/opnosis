/**
 * Formatting helpers for Opnosis frontend and backend.
 */

import { TOKEN_DECIMALS } from './constants.js';
import type { AuctionStatus } from './types.js';

/** Format a bigint token amount to a human-readable string (e.g., "1.50000000"). */
export function formatTokenAmount(amount: bigint, decimals: number = TOKEN_DECIMALS): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const frac = amount % divisor;
    const fracStr = frac.toString().padStart(decimals, '0');
    return `${whole.toString()}.${fracStr}`;
}

/** Parse a decimal string like "1.5" into base units (bigint). */
export function parseTokenAmount(input: string, decimals: number = TOKEN_DECIMALS): bigint {
    const parts = input.split('.');
    const wholePart = parts[0] ?? '0';
    let fracPart = parts[1] ?? '';
    if (fracPart.length > decimals) {
        fracPart = fracPart.slice(0, decimals);
    }
    fracPart = fracPart.padEnd(decimals, '0');
    return BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(fracPart);
}

/** Format a Unix timestamp (seconds, as bigint) to a locale date/time string. */
export function formatTimestamp(ts: bigint): string {
    return new Date(Number(ts) * 1000).toLocaleString();
}

/** Format price as "X bidding tokens per 1 auctioning token". */
export function formatPrice(minBuyAmount: bigint, sellAmount: bigint, decimals: number = TOKEN_DECIMALS): string {
    if (sellAmount === 0n) return '0';
    // price = minBuyAmount / sellAmount, scaled to decimal
    const scaled = (minBuyAmount * 10n ** BigInt(decimals)) / sellAmount;
    return formatTokenAmount(scaled, decimals);
}

/** Determine auction status from timestamps and settlement state. */
export function getAuctionStatus(
    cancellationEndDate: bigint,
    auctionEndDate: bigint,
    isSettled: boolean,
    nowSeconds?: bigint,
    orderPlacementStartDate?: bigint,
): AuctionStatus {
    if (isSettled) return 'settled';
    const now = nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
    if (now >= auctionEndDate) return 'ended';
    if (orderPlacementStartDate && orderPlacementStartDate > 0n && now < orderPlacementStartDate) return 'upcoming';
    if (now >= cancellationEndDate) return 'cancellation_closed';
    return 'open';
}
