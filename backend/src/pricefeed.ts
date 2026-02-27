/**
 * Dynamic USD price feed for auction tokens.
 *
 * Chain: BTC/USD (CoinGecko) × MOTO/BTC (NativeSwap) × Token/MOTO (Motoswap Router)
 *
 * All three price sources use time-based caching with concurrent-fetch dedup
 * and stale-on-error fallback. If any required contract address is missing,
 * the price feed is disabled and all prices return 0.
 */

import { getContract, NativeSwapAbi, MOTOSWAP_ROUTER_ABI } from 'opnet';
import { config, provider } from './config.js';
import { getNetworkConfig } from '@opnosis/shared';

// ─── Minimal typed interfaces for the contract methods we use ────────────────

interface GetReserveResult {
    properties: {
        virtualBTCReserve: bigint;
        virtualTokenReserve: bigint;
        [key: string]: bigint;
    };
}

interface NativeSwapReader {
    getReserve(token: string): Promise<GetReserveResult>;
}

interface GetAmountsOutResult {
    properties: {
        amountsOut: bigint[];
    };
}

interface MotoswapRouterReader {
    getAmountsOut(amountIn: bigint, path: string[]): Promise<GetAmountsOutResult>;
}

// ─── BTC/USD price from CoinGecko ────────────────────────────────────────────

const BTC_USD_CACHE_TTL_MS = 60_000; // 60s cache

let btcUsdCache: { price: number; fetchedAt: number } | null = null;
let btcUsdPending: Promise<number | null> | null = null;

async function fetchBtcUsd(): Promise<number | null> {
    try {
        const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        );
        if (!res.ok) return btcUsdCache?.price ?? null;
        const data: unknown = await res.json();
        if (
            typeof data !== 'object' ||
            data === null ||
            typeof (data as Record<string, unknown>)['bitcoin'] !== 'object'
        ) {
            return btcUsdCache?.price ?? null;
        }
        const bitcoin = (data as Record<string, Record<string, unknown>>)['bitcoin'];
        if (!bitcoin) return btcUsdCache?.price ?? null;
        const usd = bitcoin['usd'];
        if (typeof usd !== 'number' || !Number.isFinite(usd)) {
            return btcUsdCache?.price ?? null;
        }
        btcUsdCache = { price: usd, fetchedAt: Date.now() };
        return usd;
    } catch {
        return btcUsdCache?.price ?? null;
    }
}

async function getBtcUsd(): Promise<number | null> {
    if (btcUsdCache && Date.now() - btcUsdCache.fetchedAt < BTC_USD_CACHE_TTL_MS) {
        return btcUsdCache.price;
    }
    if (btcUsdPending) return btcUsdPending;
    btcUsdPending = fetchBtcUsd();
    try {
        return await btcUsdPending;
    } finally {
        btcUsdPending = null;
    }
}

// ─── MOTO/BTC price from NativeSwap ─────────────────────────────────────────

const MOTO_BTC_CACHE_TTL_MS = 30_000; // 30s cache

let motoBtcCache: { price: number; fetchedAt: number } | null = null;
let motoBtcPending: Promise<number | null> | null = null;

let nativeSwapContract: NativeSwapReader | null = null;

async function fetchMotoBtc(): Promise<number | null> {
    if (!nativeSwapContract || !config.motoAddress) return null;
    try {
        const result = await nativeSwapContract.getReserve(config.motoAddress);
        const { virtualBTCReserve, virtualTokenReserve } = result.properties;
        if (virtualBTCReserve === 0n || virtualTokenReserve === 0n) {
            return motoBtcCache?.price ?? null;
        }
        const price = Number(virtualBTCReserve) / Number(virtualTokenReserve);
        motoBtcCache = { price, fetchedAt: Date.now() };
        return price;
    } catch {
        return motoBtcCache?.price ?? null;
    }
}

async function getMotoBtc(): Promise<number | null> {
    if (motoBtcCache && Date.now() - motoBtcCache.fetchedAt < MOTO_BTC_CACHE_TTL_MS) {
        return motoBtcCache.price;
    }
    if (motoBtcPending) return motoBtcPending;
    motoBtcPending = fetchMotoBtc();
    try {
        return await motoBtcPending;
    } finally {
        motoBtcPending = null;
    }
}

// ─── Token/MOTO price from Motoswap Router ──────────────────────────────────

const TOKEN_MOTO_CACHE_TTL_MS = 30_000; // 30s cache

interface TokenMotoEntry {
    rate: number; // MOTO received per 1e8 of token (as float, already divided by 1e8)
    fetchedAt: number;
}

const tokenMotoCache = new Map<string, TokenMotoEntry>();
const tokenMotoPending = new Map<string, Promise<number | null>>();

let routerContract: MotoswapRouterReader | null = null;

async function fetchTokenMoto(tokenAddress: string): Promise<number | null> {
    if (!routerContract || !config.motoAddress) return null;
    const cached = tokenMotoCache.get(tokenAddress);
    try {
        const result = await routerContract.getAmountsOut(
            100_000_000n, // 1 token (1e8 base units)
            [tokenAddress, config.motoAddress],
        );
        const amountsOut = result.properties.amountsOut;
        if (!amountsOut || amountsOut.length < 2 || amountsOut[1] === 0n) {
            return cached?.rate ?? null;
        }
        // rate = MOTO received per 1 token (in base units), as a float ratio
        const rate = Number(amountsOut[1]) / 1e8;
        tokenMotoCache.set(tokenAddress, { rate, fetchedAt: Date.now() });
        return rate;
    } catch {
        return cached?.rate ?? null;
    }
}

async function getTokenMotoRate(tokenAddress: string): Promise<number | null> {
    const cached = tokenMotoCache.get(tokenAddress);
    if (cached && Date.now() - cached.fetchedAt < TOKEN_MOTO_CACHE_TTL_MS) {
        return cached.rate;
    }
    const pending = tokenMotoPending.get(tokenAddress);
    if (pending) return pending;
    const p = fetchTokenMoto(tokenAddress);
    tokenMotoPending.set(tokenAddress, p);
    try {
        return await p;
    } finally {
        tokenMotoPending.delete(tokenAddress);
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Whether the price feed has all required addresses configured. */
let enabled = false;

/**
 * Initialize contract instances. Called once at startup.
 * If any required address is missing, the price feed stays disabled.
 */
export function initPriceFeed(): void {
    if (!config.nativeSwapAddress || !config.motoAddress || !config.motoswapRouterAddress) {
        console.log('Price feed: disabled (missing NATIVE_SWAP_ADDRESS, MOTO_ADDRESS, or MOTOSWAP_ROUTER_ADDRESS)');
        return;
    }

    const networkConfig = getNetworkConfig(config.network);

    nativeSwapContract = getContract(
        config.nativeSwapAddress,
        NativeSwapAbi,
        provider,
        networkConfig.btcNetwork,
    ) as unknown as NativeSwapReader;

    routerContract = getContract(
        config.motoswapRouterAddress,
        MOTOSWAP_ROUTER_ABI,
        provider,
        networkConfig.btcNetwork,
    ) as unknown as MotoswapRouterReader;

    enabled = true;
    console.log('Price feed: enabled');
}

/**
 * Get the USD price of a token.
 *
 * - If token IS MOTO: price = motoBtcPrice × btcUsd
 * - Otherwise: price = tokenMotoRate × motoBtcPrice × btcUsd
 *
 * Returns 0 on any failure (disabled, pool missing, RPC down, etc.).
 */
export async function getTokenUsdPrice(tokenAddress: string): Promise<number> {
    if (!enabled) return 0;

    try {
        const [btcUsd, motoBtc] = await Promise.all([getBtcUsd(), getMotoBtc()]);
        if (btcUsd === null || motoBtc === null) return 0;

        // If the token IS MOTO, we already have the price
        if (tokenAddress.toLowerCase() === config.motoAddress.toLowerCase()) {
            return motoBtc * btcUsd;
        }

        // Otherwise, route through Motoswap: token → MOTO → BTC → USD
        const tokenMotoRate = await getTokenMotoRate(tokenAddress);
        if (tokenMotoRate === null) return 0;

        return tokenMotoRate * motoBtc * btcUsd;
    } catch {
        return 0;
    }
}
