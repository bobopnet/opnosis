/**
 * Shared constants for Opnosis.
 */

/** Safe env access — returns empty string in browser where process is undefined. */
function env(key: string): string {
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key] ?? '';
    }
    return '';
}

/** Contract address — set via environment or override at import site. */
export const OPNOSIS_ADDRESS: string = env('OPNOSIS_CONTRACT') || env('VITE_OPNOSIS_CONTRACT');

/** OrangeCoin (ORNGE) test token address. */
export const TOKEN_ADDRESS: string =
    env('TOKEN_ADDRESS') || env('VITE_TOKEN_ADDRESS') || 'opt1sqq63k7dtmenxhzpmqhf58rwjr9ad4rgxygetsxye';

/** Maximum orders per auction (matches contract MAX_ORDERS). */
export const MAX_ORDERS = 100;

/**
 * Fee denominator used by the contract (feeNumerator / FEE_DENOMINATOR).
 *
 * Current on-chain fee: 3/1000 = 0.3%.
 * Fee is deducted from the sell amount at settlement.
 */
export const FEE_DENOMINATOR = 1_000n;

/** Fee numerator (0.3% = 3/1000). Set on-chain via setFeeParameters. */
export const FEE_NUMERATOR = 3n;

/** Default token decimals for OPNet OP20 tokens. */
export const TOKEN_DECIMALS = 8;

/** Base unit multiplier (10^8). */
export const BASE_UNIT = 10n ** BigInt(TOKEN_DECIMALS);

/** Block explorer base URL (mainnet). */
export const EXPLORER_BASE_URL = 'https://explorer.opnet.org';
