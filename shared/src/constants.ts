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
 * To activate 0.1% protocol fee post-deployment, call:
 *   setFeeParameters(1n, feeReceiverAddress)
 * where 1/1000 = 0.1%.  Fee is deducted from the sell amount at settlement.
 */
export const FEE_DENOMINATOR = 1_000n;

/** Default fee numerator (0.1% = 1/1000). Set via setFeeParameters after deploy. */
export const FEE_NUMERATOR = 1n;

/** Default token decimals for OPNet OP20 tokens. */
export const TOKEN_DECIMALS = 8;

/** Base unit multiplier (10^8). */
export const BASE_UNIT = 10n ** BigInt(TOKEN_DECIMALS);

/** Block explorer base URL (mainnet). */
export const EXPLORER_BASE_URL = 'https://explorer.opnet.org';
