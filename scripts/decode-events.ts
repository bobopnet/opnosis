/**
 * Decode MOTO Transfer events from Opnosis bid transactions.
 *
 * Usage: npx tsx scripts/decode-events.ts
 */

// DNS workaround
import dns from 'node:dns';
const origLookup = dns.lookup.bind(dns);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = function (hostname: string, options: any, callback?: any) {
    if (hostname === 'testnet.opnet.org') {
        const cb = typeof options === 'function' ? options : callback;
        const opts = typeof options === 'object' ? options : {};
        if (opts.all) { process.nextTick(() => cb(null, [{ address: '104.18.30.10', family: 4 }])); }
        else { process.nextTick(() => cb(null, '104.18.30.10', 4)); }
        return;
    }
    if (typeof options === 'function') return origLookup(hostname, options);
    return origLookup(hostname, options, callback);
};

import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const MOTO_HEX = '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';
const contractBech32 = process.env['OPNOSIS_CONTRACT'] ?? '';

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

// Known bid transaction hashes from the block scan
const bidTxHashes = [
    '8e157484b22df5c481ec4096c68afeababfea3d809ad6d673d6d615600dab0a5', // TX1 - deploy? no events
    'a12ad2957e9b68ec43d860d4d3f5bfef609ee911f08a9f71697d3fa921bf0c10', // TX2 - setFee
    'bb86d43b1916e08b3bc12d2cb8b454e383765ecefd8078d84b7df4e94737f553', // TX3 - initiateAuction
    '066680709bf8efbbf3bdc71e2502216573383e2691ee71b9fd90d8fe8fded5ea', // TX4 - bid (auctioneer)
    '87ed528411d1cf711ab490a89fab844a8eedfe6565cd6467efbc65d2ddc503bb', // TX5 - failed bid
    '811cb79dee84e861a125bcd6e65df312fe64240a804dfc08ed329cbadd53856e', // TX6 - bid (user 2)
    '7ae77cfde22444c1287aa9a30129effc5d57e7a822bd01485b17d119aa87f02b', // TX7 - bid (user 2)
];

function decodeTransferEvent(data: Uint8Array): { operator: string; from: string; to: string; amount: bigint } {
    // Event data: operator (32 bytes) + from (32 bytes) + to (32 bytes) + amount (32 bytes)
    const operator = '0x' + Buffer.from(data.slice(0, 32)).toString('hex');
    const from = '0x' + Buffer.from(data.slice(32, 64)).toString('hex');
    const to = '0x' + Buffer.from(data.slice(64, 96)).toString('hex');
    // amount is u256 big-endian
    const amountHex = Buffer.from(data.slice(96, 128)).toString('hex');
    const amount = BigInt('0x' + amountHex);
    return { operator, from, to, amount };
}

console.log('=== Decode MOTO Transfer Events ===\n');

for (const txHash of bidTxHashes) {
    console.log(`\n--- TX: ${txHash.slice(0, 16)}... ---`);
    try {
        const receipt = await provider.getTransactionReceipt(txHash);
        console.log(`Failed: ${receipt.failed}`);
        console.log(`Revert: ${receipt.revert ?? 'none'}`);
        console.log(`Gas used: ${receipt.gasUsed}`);

        // Look for MOTO events in rawEvents
        let foundMoto = false;
        for (const [contractAddr, events] of Object.entries(receipt.rawEvents)) {
            if (contractAddr.toLowerCase() !== MOTO_HEX.toLowerCase()) continue;
            foundMoto = true;
            console.log(`\nMOTO Transfer events: ${events.length}`);
            for (const evt of events) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const evtAny = evt as any;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                console.log(`  Event type: ${evtAny.type}`);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const data: Uint8Array = evtAny.data;
                if (data && data.length >= 128) {
                    const decoded = decodeTransferEvent(data);
                    console.log(`  Full hex: ${Buffer.from(data).toString('hex')}`);
                    console.log(`  operator: ${decoded.operator.slice(0, 20)}...`);
                    console.log(`  from:     ${decoded.from.slice(0, 20)}...`);
                    console.log(`  to:       ${decoded.to.slice(0, 20)}...`);
                    console.log(`  amount:   ${decoded.amount} (${Number(decoded.amount) / 1e8} tokens)`);
                } else {
                    console.log(`  Data length: ${data?.length ?? 'undefined'}`);
                    if (data) console.log(`  Raw hex: ${Buffer.from(data).toString('hex')}`);
                }
            }
        }

        // Also check events keyed by p2op address
        if (!foundMoto) {
            for (const [contractAddr, events] of Object.entries(receipt.events)) {
                // Check if this is a MOTO contract (by looking for Transfer events)
                for (const evt of events) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
                    if ((evt as any).type === 'Transferred') {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
                        const data: Uint8Array = (evt as any).data;
                        if (data && data.length >= 128) {
                            const decoded = decodeTransferEvent(data);
                            console.log(`\n  Transfer event from ${contractAddr}:`);
                            console.log(`  Full hex: ${Buffer.from(data).toString('hex')}`);
                            console.log(`  amount: ${decoded.amount} (${Number(decoded.amount) / 1e8} tokens)`);
                        }
                    }
                }
            }
        }

        if (!foundMoto && Object.keys(receipt.rawEvents).length === 0 && Object.keys(receipt.events).length === 0) {
            console.log('  No events');
        }
    } catch (err) {
        console.log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
    }
}

// Also run the balance check
console.log('\n\n--- Current MOTO Balances ---');
const rawKeys = await provider.getPublicKeysInfoRaw([contractBech32]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
const contractTweaked = '0x' + (rawKeys[contractBech32] as any).tweakedPubkey;
console.log(`Contract hex: ${contractTweaked}`);

import { getContract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { OP_20_ABI } from '@opnosis/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moto = getContract(MOTO_HEX, OP_20_ABI, provider, network) as any;
const contractAddr = Address.fromString(contractTweaked);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const bal = await moto.balanceOf(contractAddr);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const balance: bigint = bal?.properties?.balance ?? bal?.result?.balance ?? 0n;
console.log(`Contract MOTO balance: ${balance} (${Number(balance) / 1e8} tokens)`);

// Check bidder balances from the txs above
const bidders = [
    '0x833f8f1a9d5c3a901117d75afa49164828939c4a2e7003e1db44f9928c615db5',
    '0x25fbcd45f800bd90613540795ea8701226650448d9edaa65d20a38d337adb140',
];
for (const bidder of bidders) {
    const addr = Address.fromString(bidder);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const b = await moto.balanceOf(addr);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const v: bigint = b?.properties?.balance ?? b?.result?.balance ?? 0n;
    console.log(`Bidder ${bidder.slice(0, 12)}... MOTO: ${v} (${Number(v) / 1e8} tokens)`);
}

console.log('\n=== Done ===');
