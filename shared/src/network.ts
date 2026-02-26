/**
 * Network configuration for OPNet environments.
 */

import { networks } from '@btc-vision/bitcoin';
import type { Network } from '@btc-vision/bitcoin';

export interface NetworkConfig {
    readonly name: string;
    readonly rpcUrl: string;
    readonly btcNetwork: Network;
}

export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
    testnet: {
        name: 'testnet',
        rpcUrl: 'https://testnet.opnet.org/v1/json-rpc',
        btcNetwork: networks.opnetTestnet,
    },
    mainnet: {
        name: 'mainnet',
        rpcUrl: 'https://mainnet.opnet.org/v1/json-rpc',
        btcNetwork: networks.bitcoin,
    },
};

/** Resolve a network config by name. Defaults to testnet. */
export function getNetworkConfig(name?: string): NetworkConfig {
    if (name && name in NETWORK_CONFIGS) {
        return NETWORK_CONFIGS[name]!;
    }
    return NETWORK_CONFIGS['testnet']!;
}
