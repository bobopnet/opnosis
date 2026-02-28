/**
 * Quick check: what decimals does the MOTO token report on-chain?
 */
import { JSONRpcProvider, getContract, OP_20_ABI } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const MOTO = '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';
const PILL = '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb';

async function main() {
    const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.testnet });

    for (const [sym, addr] of [['MOTO', MOTO], ['PILL', PILL]]) {
        const token = getContract(addr, OP_20_ABI, provider, networks.testnet) as any;
        try {
            const res = await token.decimals();
            console.log(`${sym} decimals:`, res?.properties?.decimals ?? res?.decoded ?? res);
        } catch (e: any) {
            console.log(`${sym} decimals error:`, e.message);
        }
    }
}

main().catch(console.error);
