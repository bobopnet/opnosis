/**
 * Debug bid transaction receipts — check for Transfer events.
 *
 * Usage: npx tsx scripts/debug-receipts.ts
 *
 * Scans recent blocks for transactions to the Opnosis contract,
 * then inspects receipts for Transfer/Transferred events from the
 * bidding token (MOTO).
 */

// DNS workaround
import dns from 'node:dns';
const origLookup = dns.lookup.bind(dns);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = function (hostname: string, options: any, callback?: any) {
    if (hostname === 'testnet.opnet.org') {
        const cb = typeof options === 'function' ? options : callback;
        const opts = typeof options === 'object' ? options : {};
        if (opts.all) {
            process.nextTick(() => cb(null, [{ address: '104.18.30.10', family: 4 }]));
        } else {
            process.nextTick(() => cb(null, '104.18.30.10', 4));
        }
        return;
    }
    if (typeof options === 'function') {
        return origLookup(hostname, options);
    }
    return origLookup(hostname, options, callback);
};

import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const MOTO_HEX = '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';
const contractBech32 = process.env['OPNOSIS_CONTRACT'] ?? '';

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

console.log('=== Bid Receipt Debug ===\n');
console.log(`Opnosis contract: ${contractBech32}`);
console.log(`MOTO token:       ${MOTO_HEX}\n`);

// Resolve contract hex address
const rawKeys = await provider.getPublicKeysInfoRaw([contractBech32]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const info = rawKeys[contractBech32] as any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
if (!info?.tweakedPubkey) {
    console.error('Could not resolve Opnosis contract public key');
    process.exit(1);
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const contractHex = '0x' + info.tweakedPubkey;
console.log(`Contract hex: ${contractHex}\n`);

// Get current block height
const currentBlock = await provider.getBlockNumber();
console.log(`Current block: ${currentBlock}\n`);

// Scan last 50 blocks for transactions to the Opnosis contract
const SCAN_BLOCKS = 500;
const startBlock = Number(currentBlock) - SCAN_BLOCKS;

console.log(`Scanning blocks ${startBlock} to ${currentBlock}...\n`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stringify = (_: string, v: any) => typeof v === 'bigint' ? v.toString() : v;

let txFound = 0;

for (let blockNum = startBlock; blockNum <= Number(currentBlock); blockNum++) {
    try {
        const block = await provider.getBlock(BigInt(blockNum), true);
        if (!block) continue;

        for (const tx of block.transactions) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const txAny = tx as any;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const txContract: string = txAny.contractAddress ?? '';

            // Check if tx targets Opnosis contract (bech32 or hex)
            if (txContract.toLowerCase() !== contractHex.toLowerCase() &&
                txContract.toLowerCase() !== contractBech32.toLowerCase()) {
                continue;
            }

            txFound++;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const txHash: string = txAny.hash ?? txAny.id ?? 'unknown';
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const txFrom: string = txAny.from ?? 'unknown';

            console.log(`\n${'='.repeat(60)}`);
            console.log(`TX ${txFound} (block ${blockNum})`);
            console.log(`Hash: ${txHash}`);
            console.log(`From: ${txFrom}`);
            console.log(`To:   ${txContract}`);

            // Check receipt on the tx object itself
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const revert: string | undefined = txAny.revert;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const gasUsed = txAny.gasUsed;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const events = txAny.events ?? {};
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const rawEvents = txAny.rawEvents ?? {};

            console.log(`Gas used: ${gasUsed}`);
            console.log(`Reverted: ${revert ? `YES - ${revert}` : 'no'}`);

            // Show ALL events grouped by contract
            const allEventContracts = new Set([
                ...Object.keys(events as object),
                ...Object.keys(rawEvents as object),
            ]);

            if (allEventContracts.size === 0) {
                console.log('Events: NONE');
            } else {
                console.log(`Events from ${allEventContracts.size} contract(s):`);
                for (const addr of allEventContracts) {
                    const isMoto = addr.toLowerCase() === MOTO_HEX.toLowerCase();
                    const isOpnosis = addr.toLowerCase() === contractHex.toLowerCase();
                    const label = isMoto ? 'MOTO' : isOpnosis ? 'OPNOSIS' : addr.slice(0, 20);
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const evts = (rawEvents[addr] ?? events[addr] ?? []) as { type?: string; data?: Uint8Array }[];
                    console.log(`  [${label}] ${evts.length} event(s):`);
                    for (const evt of evts) {
                        console.log(`    type: ${evt.type ?? 'unknown'}`);
                        if (evt.data && evt.data instanceof Uint8Array) {
                            console.log(`    data (${evt.data.length} bytes): ${Buffer.from(evt.data).toString('hex').slice(0, 200)}`);
                        } else if (evt.data) {
                            console.log(`    data: ${JSON.stringify(evt.data, stringify)}`);
                        }
                    }
                }
            }

            // Also try separate receipt fetch to be thorough
            try {
                const receipt = await provider.getTransactionReceipt(txHash);
                if (receipt.revert) {
                    console.log(`\nReceipt revert: ${receipt.revert}`);
                }
                if (receipt.failed) {
                    console.log(`\nReceipt FAILED`);
                }
                const receiptRawEvents = receipt.rawEvents ?? {};
                const motoEvents = receiptRawEvents[MOTO_HEX] ?? receiptRawEvents[MOTO_HEX.toLowerCase()] ?? [];
                if (motoEvents.length > 0) {
                    console.log(`\nMOTO events from receipt: ${motoEvents.length}`);
                    for (const evt of motoEvents) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        console.log(`  type: ${(evt as any).type}`);
                    }
                } else {
                    // Check all keys in receipt events
                    const allKeys = [...Object.keys(receipt.events), ...Object.keys(receipt.rawEvents)];
                    if (allKeys.length > 0) {
                        console.log(`\nReceipt event keys: ${allKeys.join(', ')}`);
                    } else {
                        console.log(`\nReceipt: no events`);
                    }
                }
            } catch (receiptErr) {
                console.log(`Receipt fetch error: ${receiptErr instanceof Error ? receiptErr.message : String(receiptErr)}`);
            }
        }
    } catch {
        // skip blocks that fail
    }
}

// Also run the balance/allowance check
console.log(`\n\n${'='.repeat(60)}`);
console.log(`Total Opnosis TXs found in last ${SCAN_BLOCKS} blocks: ${txFound}`);
console.log('\n=== Debug Complete ===');
