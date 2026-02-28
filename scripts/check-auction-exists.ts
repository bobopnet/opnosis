import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { OpnosisContract } from '@opnosis/shared';

const contractAddress = process.env['OPNOSIS_CONTRACT'] ?? '';
const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

console.log(`Contract: ${contractAddress}`);

const opnosis = new OpnosisContract(contractAddress, provider, network);

try {
    const result = await opnosis.getAuctionData(1n);
    console.log('Auction 1:', JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
} catch (e) {
    console.log('Error:', e instanceof Error ? e.message : String(e));
}
