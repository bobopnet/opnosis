/**
 * Deploy Opnosis contract to testnet.
 *
 * Usage: npx tsx scripts/deploy.ts
 */

// DNS workaround: hardcode testnet.opnet.org IP when DNS is unavailable
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
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    AddressTypes,
    IDeploymentParameters,
    TransactionFactory,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mnemonic = process.env['MNEMONIC'];
if (!mnemonic) {
    console.error('MNEMONIC not set in .env');
    process.exit(1);
}

const networkName = process.env['NETWORK'] ?? 'testnet';
const network = networkName === 'mainnet' ? networks.bitcoin : networks.opnetTestnet;
const rpcUrl = networkName === 'mainnet'
    ? 'https://mainnet.opnet.org'
    : 'https://testnet.opnet.org';

console.log(`Network : ${networkName}`);
console.log(`RPC     : ${rpcUrl}`);

// Derive wallet
const mnemonicObj = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonicObj.deriveOPWallet(AddressTypes.P2TR, 0);
console.log(`P2TR    : ${wallet.p2tr}`);

// Provider
const provider = new JSONRpcProvider({ url: rpcUrl, network });

// Get CSV address where funds are held
const csvInfo = await provider.getCSV1ForAddress(wallet.address);
const csvAddress = csvInfo.address;
console.log(`CSV     : ${csvAddress}`);

// Check UTXOs on both P2TR and CSV addresses
let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
const p2trBalance = await provider.getBalance(wallet.p2tr);
console.log(`P2TR bal: ${p2trBalance} sats (${utxos.length} UTXOs)`);

const csvUtxos = await provider.utxoManager.getUTXOs({ address: csvAddress });
const csvBalance = await provider.getBalance(csvAddress);
console.log(`CSV bal : ${csvBalance} sats (${csvUtxos.length} UTXOs)`);

// Use CSV UTXOs if P2TR is empty — attach witnessScript for P2WSH spending
if (utxos.length === 0 && csvUtxos.length > 0) {
    console.log('\nUsing CSV UTXOs for deployment...');
    const witnessScript = Buffer.from(csvInfo.witnessScript);
    utxos = csvUtxos.map((u) => ({ ...u, witnessScript }));
}

if (utxos.length === 0) {
    console.error('\nNo UTXOs found on any address. Fund the wallet first.');
    process.exit(1);
}

// Read WASM bytecode
const wasmPath = path.resolve(__dirname, '../contracts/build/Opnosis.wasm');
if (!fs.existsSync(wasmPath)) {
    console.error(`WASM not found at ${wasmPath}. Run: cd contracts && npm run build`);
    process.exit(1);
}
const bytecode = fs.readFileSync(wasmPath);
console.log(`Bytecode: ${bytecode.length} bytes`);

// Get PoW challenge
const challenge = await provider.getChallenge();
console.log('Challenge obtained');

// Use CSV address as "from" when funds are there
const fromAddress = p2trBalance > 0n ? wallet.p2tr : csvAddress;

// Prepare deployment
const deploymentParams: IDeploymentParameters = {
    from: fromAddress,
    utxos,
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    network,
    feeRate: 5,
    priorityFee: 0n,
    gasSatFee: 10_000n,
    bytecode,
    challenge,
    linkMLDSAPublicKeyToAddress: true,
    revealMLDSAPublicKey: true,
};

console.log(`\nSigning deployment from ${fromAddress}...`);
const factory = new TransactionFactory();
const deployment = await factory.signDeployment(deploymentParams);

console.log(`Contract address: ${deployment.contractAddress}`);
console.log(`Estimated fees  : ${deployment.estimatedFees} sats`);

// Broadcast
console.log('\nBroadcasting funding TX...');
const fundingResult = await provider.sendRawTransaction(deployment.transaction[0]);
console.log(`Funding TX : ${fundingResult.result} (${fundingResult.peers} peers)`);

console.log('Broadcasting reveal TX...');
const revealResult = await provider.sendRawTransaction(deployment.transaction[1]);
console.log(`Reveal TX  : ${revealResult.result} (${revealResult.peers} peers)`);

console.log('\n=== Deployment successful ===');
console.log(`Contract: ${deployment.contractAddress}`);
console.log('\nUpdate your config:');
console.log(`  shared/src/constants.ts -> OPNOSIS_ADDRESS = '${deployment.contractAddress}'`);
console.log(`  .env                    -> CONTRACT_ADDRESS=${deployment.contractAddress}`);
