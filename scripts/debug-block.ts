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

import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });
const contractHex = '0x882d132622bedb8188035ba48b6646d3d3e960339098e1e94e89ad35a9fa03bb';

const bn = await provider.getBlockNumber();
console.log('Current block:', bn.toString());

// Find a block with transactions
for (let i = 0; i < 200; i++) {
    const blockNum = bn - BigInt(i);
    const block = await provider.getBlock(blockNum, true);
    if (block.transactions.length > 0) {
        console.log(`\nBlock ${blockNum} has ${block.transactions.length} transactions:`);
        for (const tx of block.transactions) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const a = tx as any;
            console.log(`  TX keys: ${Object.keys(a).filter(k => typeof a[k] !== 'function').join(', ')}`);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            console.log(`  contractAddress: "${a.contractAddress ?? '(undefined)'}"`);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            console.log(`  hash: "${a.hash ?? a.id ?? '(no hash)'}"`);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            console.log(`  from: "${a.from ?? '(no from)'}"`);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            console.log(`  OPNetType: ${a.OPNetType}`);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const isTarget = a.contractAddress?.toLowerCase() === contractHex.toLowerCase();
            console.log(`  isOpnosis: ${isTarget}`);
            console.log('');
        }
        break; // just show first block with txs
    }
}
