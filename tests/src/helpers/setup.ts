/**
 * Test setup — creates provider and contract instances for testnet.
 *
 * PREREQUISITES:
 *  - Running OPNet testnet node at https://testnet.opnet.org
 *  - Deployed Opnosis contract (set OPNOSIS_CONTRACT env var)
 *  - Funded test wallet(s)
 */

import { JSONRpcProvider } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { OpnosisContract, getNetworkConfig } from '@opnosis/shared';

const networkConfig = getNetworkConfig('testnet');

export const provider: AbstractRpcProvider = new JSONRpcProvider({
    url: networkConfig.rpcUrl,
    network: networkConfig.btcNetwork,
});

const contractAddress = process.env['OPNOSIS_CONTRACT'] ?? '';
if (!contractAddress) {
    console.warn('WARNING: OPNOSIS_CONTRACT env var not set. Tests will fail.');
}

export const opnosis = new OpnosisContract(contractAddress, provider, networks.opnetTestnet);

export { contractAddress };
