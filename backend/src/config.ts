/**
 * Backend configuration — reads from environment variables.
 */

import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { getNetworkConfig } from '@opnosis/shared';

const networkName = process.env['NETWORK'] ?? 'testnet';
const networkConfig = getNetworkConfig(networkName);

export const config = {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    contractAddress: process.env['OPNOSIS_CONTRACT'] ?? '',
    network: networkName,
    rpcUrl: process.env['OPNET_RPC_URL'] ?? networkConfig.rpcUrl,
    cacheTtlMs: parseInt(process.env['CACHE_TTL_MS'] ?? '30000', 10),
    indexerPollMs: parseInt(process.env['INDEXER_POLL_MS'] ?? '15000', 10),
    nativeSwapAddress: process.env['NATIVE_SWAP_ADDRESS'] ?? '',
    motoAddress: process.env['MOTO_ADDRESS'] ?? '',
    motoswapRouterAddress: process.env['MOTOSWAP_ROUTER_ADDRESS'] ?? '',
} as const;

export const provider: AbstractRpcProvider = new JSONRpcProvider({
    url: config.rpcUrl,
    network: networkConfig.btcNetwork,
});
