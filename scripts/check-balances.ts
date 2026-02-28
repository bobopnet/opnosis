/**
 * Check MOTO balances for the Opnosis contract and bidder addresses.
 *
 * Usage: npx tsx scripts/check-balances.ts
 */

import 'dotenv/config';
import { getContract, JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { OP_20_ABI } from '@opnosis/shared';

const MOTO_HEX = '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';
const contractAddress = process.env['OPNOSIS_CONTRACT'] ?? '';

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

// Resolve Opnosis contract to Address
const rawKeys = await provider.getPublicKeysInfoRaw([contractAddress]);
const info = rawKeys[contractAddress];
if (!info?.tweakedPubkey) {
    console.error('Could not resolve Opnosis contract public key');
    process.exit(1);
}
const opnosisAddr = Address.fromString('0x' + info.tweakedPubkey);
console.log(`Opnosis contract: ${contractAddress}`);
console.log(`Opnosis hex:      0x${info.tweakedPubkey}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moto = getContract(MOTO_HEX, OP_20_ABI, provider, network) as any;

// Check MOTO balance of Opnosis contract
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const contractBal = await moto.balanceOf(opnosisAddr);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const contractBalance: bigint = contractBal?.properties?.balance ?? contractBal?.result?.balance ?? 0n;
console.log(`\nOpnosis MOTO balance: ${contractBalance} (${Number(contractBalance) / 1e8})`);

// Check some bidder addresses if provided
const bidderAddresses = process.argv.slice(2);
for (const addr of bidderAddresses) {
    try {
        const bidderAddr = Address.fromString(addr.startsWith('0x') ? addr : '0x' + addr);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const bal = await moto.balanceOf(bidderAddr);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const balance: bigint = bal?.properties?.balance ?? bal?.result?.balance ?? 0n;
        console.log(`Bidder ${addr.slice(0, 16)}... MOTO: ${balance} (${Number(balance) / 1e8})`);
    } catch (err) {
        console.error(`Error checking ${addr}:`, err);
    }
}
