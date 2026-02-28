import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { OpnosisContract } from '@opnosis/shared';

const addr = process.env['OPNOSIS_CONTRACT'] ?? '';
const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

console.log(`Contract: ${addr}`);
const contract = new OpnosisContract(addr, provider, network);

try {
    const raw = await contract.getAuctionData(1n);
    console.log('Auction 1 raw:', JSON.stringify(raw, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
} catch (err) {
    console.error('Error fetching auction 1:', err);
}

try {
    const raw = await contract.getAuctionData(0n);
    console.log('Auction 0 raw:', JSON.stringify(raw, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
} catch (err) {
    console.error('Error fetching auction 0:', err);
}
