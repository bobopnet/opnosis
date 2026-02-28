/**
 * Formatting helpers for Opnosis frontend and backend.
 */

import { TOKEN_DECIMALS } from './constants.js';
import type { AuctionStatus } from './types.js';

/** Format a bigint token amount to a human-readable string, stripping trailing zeros. */
export function formatTokenAmount(amount: bigint, decimals: number = TOKEN_DECIMALS): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const frac = amount % divisor;
    if (frac === 0n) return whole.toLocaleString();
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${whole.toLocaleString()}.${fracStr}`;
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

/** Format a Unix timestamp (seconds or milliseconds, as bigint) to a locale date/time string. */
export function formatTimestamp(ts: bigint): string {
    const n = Number(ts);
    // If > 1e10 the value is in milliseconds (no seconds timestamp exceeds this until year 2286)
    const ms = n > 1e10 ? n : n * 1000;
    return new Date(ms).toLocaleString();
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
    nowMs?: bigint,
    orderPlacementStartDate?: bigint,
): AuctionStatus {
    if (isSettled) return 'settled';
    const now = nowMs ?? BigInt(Date.now());
    if (now >= auctionEndDate) return 'ended';
    if (orderPlacementStartDate && orderPlacementStartDate > 0n && now < orderPlacementStartDate) return 'upcoming';
    if (now >= cancellationEndDate) return 'cancellation_closed';
    return 'open';
}
