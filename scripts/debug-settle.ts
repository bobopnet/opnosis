import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { OpnosisContract } from '@opnosis/shared';

const addr = process.env['OPNOSIS_CONTRACT'] ?? '';
const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

console.log(`Contract: ${addr}`);
const contract = new OpnosisContract(addr, provider, network);

const raw = await contract.getAuctionData(1n);
const r = raw?.properties;
console.log('isSettled:', r?.isSettled);
console.log('fundingNotReached:', r?.fundingNotReached);
console.log('auctionEndDate:', r?.auctionEndDate?.toString());
console.log('orderCount:', r?.orderCount?.toString());
console.log('now:', Date.now());

console.log('\nSimulating settleAuction(1)...');
try {
    const sim = await contract.simulateSettle(1n);
    console.log('Sim type:', typeof sim);
    console.log('Sim keys:', Object.keys(sim as object));
    if ('error' in (sim as object)) {
        console.log('Sim ERROR:', (sim as { error: string }).error);
    } else {
        console.log('Sim SUCCESS');
    }
} catch (err) {
    console.error('Sim threw:', err);
}
