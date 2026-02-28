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
console.log('Block number:', bn.toString());
const block = await provider.getBlock(bn);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const b = block as any;
console.log('Block keys:', Object.keys(b).filter(k => typeof b[k] !== 'function').join(', '));
console.log('time:', b.time?.toString());
console.log('medianTime:', b.medianTime?.toString());
console.log('Date.now():', Date.now());
console.log('Date.now() as seconds:', Math.floor(Date.now() / 1000));

// Check the existing auction's auctionEndDate for reference
console.log('\nExisting auction #1 auctionEndDate: 1772344161934');
console.log('  As Date:', new Date(1772344161934).toISOString());
console.log('  If seconds:', new Date(1772344161934 * 1000).toISOString());
