/**
 * Backend configuration — reads from environment variables.
 */

import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import type { AbstractRpcProvider, TransactionParameters } from 'opnet';
import { Mnemonic, AddressTypes, MLDSASecurityLevel } from '@btc-vision/transaction';
import { getNetworkConfig } from '@opnosis/shared';

const networkName = process.env['NETWORK'] ?? 'testnet';
export const networkConfig = getNetworkConfig(networkName);

export const config = {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    contractAddress: process.env['OPNOSIS_CONTRACT'] ?? '',
    network: networkName,
    rpcUrl: process.env['OPNET_RPC_URL'] ?? networkConfig.rpcUrl,
    cacheTtlMs: parseInt(process.env['CACHE_TTL_MS'] ?? '30000', 10),
    indexerPollMs: parseInt(process.env['INDEXER_POLL_MS'] ?? '8000', 10),
    nativeSwapAddress: process.env['NATIVE_SWAP_ADDRESS'] ?? '',
    motoAddress: process.env['MOTO_ADDRESS'] ?? '',
    motoswapRouterAddress: process.env['MOTOSWAP_ROUTER_ADDRESS'] ?? '',
} as const;

export const provider: AbstractRpcProvider = new JSONRpcProvider({
    url: config.rpcUrl,
    network: networkConfig.btcNetwork,
});

// Optional wallet for auto-settle (when MNEMONIC is set)
const mnemonic = process.env['MNEMONIC'];
export const wallet = mnemonic
    ? new Mnemonic(mnemonic, '', networkConfig.btcNetwork, MLDSASecurityLevel.LEVEL2)
        .deriveOPWallet(AddressTypes.P2TR, 0)
    : null;

export const txParams: TransactionParameters | null = wallet ? {
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    maximumAllowedSatToSpend: 50_000n,
    feeRate: 10,
    network: networkConfig.btcNetwork,
} : null;
