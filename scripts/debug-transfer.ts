/**
 * Debug MOTO transfer issue — check allowances, balances, and address resolution.
 *
 * Usage: npx tsx scripts/debug-transfer.ts
 *
 * This script:
 * 1. Resolves Opnosis contract to all address forms
 * 2. Checks MOTO balances for contract and bidders
 * 3. Checks MOTO allowances using each possible spender address form
 * 4. Fetches orders from backend API to find bidder addresses
 */

import 'dotenv/config';
import { getContract, JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { OP_20_ABI } from '@opnosis/shared';

const MOTO_HEX = '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';
const contractBech32 = process.env['OPNOSIS_CONTRACT'] ?? '';
const API_BASE = 'http://localhost:3001';

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

console.log('=== Opnosis Transfer Debug ===\n');

// Step 1: Resolve Opnosis contract addresses
console.log('--- Step 1: Contract Address Resolution ---');
console.log(`Bech32: ${contractBech32}`);

const rawKeys = await provider.getPublicKeysInfoRaw([contractBech32]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const info = rawKeys[contractBech32] as any;
if (!info?.tweakedPubkey) {
    console.error('Could not resolve Opnosis contract public key');
    process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const tweakedPubkey: string = info.tweakedPubkey;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const mldsaHashedPublicKey: string | undefined = info.mldsaHashedPublicKey;

console.log(`tweakedPubkey:         0x${tweakedPubkey}`);
console.log(`mldsaHashedPublicKey:  ${mldsaHashedPublicKey ? '0x' + mldsaHashedPublicKey : '(none)'}`);

const addrFromTweaked = Address.fromString('0x' + tweakedPubkey);
console.log(`Address(tweaked):      ${addrFromTweaked.toString()}`);

const spenderMldsa = mldsaHashedPublicKey || tweakedPubkey;
const frontendSpenderAddr = Address.fromString('0x' + spenderMldsa, '0x' + tweakedPubkey);
console.log(`Frontend spender addr: ${frontendSpenderAddr.toString()}`);
console.log(`Addresses equal:       ${addrFromTweaked.equals(frontendSpenderAddr)}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moto = getContract(MOTO_HEX, OP_20_ABI, provider, network) as any;

// Step 2: Check MOTO balance of contract
console.log('\n--- Step 2: Contract MOTO Balance ---');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const contractBal = await moto.balanceOf(addrFromTweaked);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const contractBalance: bigint = contractBal?.properties?.balance ?? contractBal?.result?.balance ?? 0n;
console.log(`Contract MOTO balance: ${contractBalance} (${Number(contractBalance) / 1e8})`);

// Step 3: Fetch orders from backend API
console.log('\n--- Step 3: Auction Orders (from backend API) ---');
interface ApiAuction { id: string; biddingToken: string; biddingTokenSymbol?: string; orderCount: string; isSettled: boolean; }
interface ApiOrder { orderId: number; sellAmount: string; buyAmount: string; userAddress: string; cancelled: boolean; claimed: boolean; }

try {
    const auctionsRes = await fetch(`${API_BASE}/auctions`);
    if (!auctionsRes.ok) throw new Error(`API returned ${auctionsRes.status}`);
    const auctions = await auctionsRes.json() as ApiAuction[];
    console.log(`Found ${auctions.length} auctions`);

    const bidderAddresses = new Set<string>();

    for (const auction of auctions) {
        if (Number(auction.orderCount) === 0) continue;

        console.log(`\nAuction ${auction.id} (${auction.biddingTokenSymbol || '?'}, orders: ${auction.orderCount}, settled: ${auction.isSettled})`);

        try {
            const ordersRes = await fetch(`${API_BASE}/auctions/${auction.id}/orders`);
            if (!ordersRes.ok) { console.log('  (orders fetch failed)'); continue; }
            const orders = await ordersRes.json() as ApiOrder[];

            for (const o of orders) {
                if (!o.userAddress) continue;
                bidderAddresses.add(o.userAddress);
                console.log(`  Order ${o.orderId}: sell=${o.sellAmount} buy=${o.buyAmount} user=${o.userAddress.slice(0, 20)}... cancelled=${o.cancelled} claimed=${o.claimed}`);
            }
        } catch (e) {
            console.log(`  Error fetching orders: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // Step 4: Check allowances for each unique bidder
    console.log('\n--- Step 4: Bidder Allowances & Balances ---');
    for (const hexAddr of bidderAddresses) {
        console.log(`\nBidder: ${hexAddr}`);
        try {
            const bidderAddr = Address.fromString(hexAddr.startsWith('0x') ? hexAddr : '0x' + hexAddr);

            // Balance
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const bal = await moto.balanceOf(bidderAddr);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const balance: bigint = bal?.properties?.balance ?? bal?.result?.balance ?? 0n;
            console.log(`  MOTO balance: ${balance} (${Number(balance) / 1e8})`);

            // Allowance to tweaked address
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const allow1 = await moto.allowance(bidderAddr, addrFromTweaked);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const val1: bigint = allow1?.properties?.remaining ?? allow1?.result?.remaining ?? 0n;
            console.log(`  Allowance → contract(tweaked): ${val1} (${Number(val1) / 1e8})`);

            // Allowance to frontend spender
            if (!addrFromTweaked.equals(frontendSpenderAddr)) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                const allow2 = await moto.allowance(bidderAddr, frontendSpenderAddr);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const val2: bigint = allow2?.properties?.remaining ?? allow2?.result?.remaining ?? 0n;
                console.log(`  Allowance → contract(frontend): ${val2} (${Number(val2) / 1e8})`);
            }
        } catch (e) {
            console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
} catch (e) {
    console.error(`Failed to fetch from backend: ${e instanceof Error ? e.message : String(e)}`);
    console.log('Is the backend running on port 3001?');
}

console.log('\n=== Debug Complete ===');
