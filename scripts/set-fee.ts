/**
 * Set the protocol fee on the Opnosis contract.
 *
 * Usage: npx tsx scripts/set-fee.ts
 *
 * Fee = feeNumerator / 1000.  Max 15 (1.5%).
 * Only the contract owner can call this.
 * Only affects future auctions — existing auctions keep their snapshotted fee.
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import {
    AddressTypes,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { getContract, JSONRpcProvider } from 'opnet';
import type { TransactionParameters } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { OPNOSIS_ABI } from '@opnosis/shared';

// ── Config ───────────────────────────────────────────────────────────────────
const FEE_NUMERATOR = 3n; // 3/1000 = 0.3%

const mnemonic = process.env['MNEMONIC'];
if (!mnemonic) { console.error('MNEMONIC not set in .env'); process.exit(1); }

const contractAddress = process.env['OPNOSIS_CONTRACT'];
if (!contractAddress) { console.error('OPNOSIS_CONTRACT not set in .env'); process.exit(1); }

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

const mnemonicObj = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonicObj.deriveOPWallet(AddressTypes.P2TR, 0);
console.log(`Wallet  : ${wallet.p2tr}`);
console.log(`Opnosis : ${contractAddress}`);
console.log(`Fee     : ${FEE_NUMERATOR}/1000 = ${Number(FEE_NUMERATOR) / 10}%`);

const txParams: TransactionParameters = {
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    maximumAllowedSatToSpend: 50_000n,
    feeRate: 10,
    network,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opnosis = getContract(contractAddress, OPNOSIS_ABI, provider, network, wallet.address) as any;

// Fee receiver = deployer wallet address
const feeReceiver = wallet.address;
console.log(`Receiver: ${feeReceiver.toString()}`);

console.log('\nSimulating setFeeParameters...');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const sim = await opnosis.setFeeParameters(FEE_NUMERATOR, feeReceiver);

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
if (sim.revert) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.error('Would revert:', sim.revert);
    process.exit(1);
}

console.log('Simulation OK, sending transaction...');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const receipt = await sim.sendTransaction(txParams);

console.log('\n=== Fee updated ===');
console.log('Receipt:', receipt);
console.log(`Fee: ${Number(FEE_NUMERATOR) / 10}% (${FEE_NUMERATOR}/1000)`);
