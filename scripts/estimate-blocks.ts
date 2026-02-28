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

const bn = await provider.getBlockNumber();
console.log('Current block:', bn.toString());

const block = await provider.getBlock(bn);
console.log('Block time:', block.time, new Date(block.time * 1000).toISOString());

const oldBlock = await provider.getBlock(bn - 200n);
console.log('Block -200 time:', oldBlock.time, new Date(oldBlock.time * 1000).toISOString());

const timeDiff = block.time - oldBlock.time;
const blocksPerHour = 200 / (timeDiff / 3600);
console.log('Blocks per hour:', blocksPerHour.toFixed(1));
console.log('Need to go back ~', Math.ceil(6 * blocksPerHour), 'blocks for 6 hours');
