/**
 * Diagnostic: check auction settlement state + contract token balances
 * Usage: npx tsx scripts/check-deploy.ts
 */
import 'dotenv/config';
import { JSONRpcProvider, getContract, OP_20_ABI } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { OpnosisContract, formatTokenAmount } from '@opnosis/shared';

const addr = process.env['OPNOSIS_CONTRACT'] ?? '';
const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

console.log(`Contract: ${addr}\n`);
const contract = new OpnosisContract(addr, provider, network);

// ── Auction data ─────────────────────────────────────────────────────────────
const auctionId = 1n;
console.log(`=== Auction ${auctionId} ===`);

try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const raw: any = await contract.getAuctionData(auctionId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const props = raw?.properties ?? {};
    console.log('Auction data:', JSON.stringify(props, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const auctioningToken: string = String(props.auctioningToken ?? '');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const biddingToken: string = String(props.biddingToken ?? '');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const sellAmount = BigInt(props.auctionedSellAmount ?? 0);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const isSettled = Boolean(props.isSettled);

    console.log(`\nAuctioning token: ${auctioningToken}`);
    console.log(`Bidding token: ${biddingToken}`);
    console.log(`Sell amount: ${formatTokenAmount(sellAmount)}`);
    console.log(`Settled: ${isSettled}`);

    // ── Check contract balances ──────────────────────────────────────────────
    if (auctioningToken) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const op20 = getContract(auctioningToken, OP_20_ABI, provider, network) as any;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const balResult = await op20.balanceOf(addr);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const bal = BigInt(balResult?.properties?.balance ?? balResult?.decoded?.[0] ?? 0);
            console.log(`\nContract auctioning token balance: ${formatTokenAmount(bal)}`);
        } catch (err) {
            console.error('Error checking auctioning token balance:', err);
        }
    }
    if (biddingToken) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const op20 = getContract(biddingToken, OP_20_ABI, provider, network) as any;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const balResult = await op20.balanceOf(addr);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const bal = BigInt(balResult?.properties?.balance ?? balResult?.decoded?.[0] ?? 0);
            console.log(`Contract bidding token balance: ${formatTokenAmount(bal)}`);
        } catch (err) {
            console.error('Error checking bidding token balance:', err);
        }
    }

    // ── Clearing order ───────────────────────────────────────────────────────
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const clearing: any = await contract.getClearingOrder(auctionId);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        console.log('\nClearing order:', JSON.stringify(clearing?.properties ?? {}, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (err) {
        console.error('Error getting clearing order:', err);
    }

    // ── Orders ───────────────────────────────────────────────────────────────
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const ordersRaw: any = await contract.getAuctionOrders(auctionId);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        console.log('\nOrders raw:', JSON.stringify(ordersRaw?.properties ?? {}, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (err) {
        console.error('Error getting orders:', err);
    }

} catch (err) {
    console.error('Error fetching auction data:', err);
}
