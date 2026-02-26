/**
 * Create a test auction on OPNet testnet.
 *
 * Usage: npx tsx scripts/create-auction.ts
 *
 * Uses MOTO as auctioning token and PILL as bidding token (known testnet tokens).
 */

import 'dotenv/config';
import {
    AddressTypes,
    Mnemonic,
    MLDSASecurityLevel,
    Address,
} from '@btc-vision/transaction';
import { getContract, JSONRpcProvider } from 'opnet';
import type { TransactionParameters } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { OPNOSIS_ABI, OP_20_ABI } from '@opnosis/shared';

// ── Known testnet tokens ─────────────────────────────────────────────────────
const MOTO = '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';
const PILL = '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb';

// ── Config ───────────────────────────────────────────────────────────────────
const mnemonic = process.env['MNEMONIC'];
if (!mnemonic) { console.error('MNEMONIC not set in .env'); process.exit(1); }

const contractAddress = process.env['OPNOSIS_CONTRACT'];
if (!contractAddress) { console.error('OPNOSIS_CONTRACT not set in .env'); process.exit(1); }

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

const mnemonicObj = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonicObj.deriveOPWallet(AddressTypes.P2TR, 0);
console.log(`Wallet  : ${wallet.p2tr}`);
console.log(`Contract: ${contractAddress}`);

// ── Transaction params for backend signing ───────────────────────────────────
const txParams: TransactionParameters = {
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    maximumAllowedSatToSpend: 50_000n,
    feeRate: 10,
    network,
};

// ── Check token balances ─────────────────────────────────────────────────────
const motoAddr = Address.fromString(MOTO);
const pillAddr = Address.fromString(PILL);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const motoToken = getContract(MOTO, OP_20_ABI, provider, network, wallet.address) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pillToken = getContract(PILL, OP_20_ABI, provider, network, wallet.address) as any;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const motoBal = await motoToken.balanceOf(wallet.address);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const pillBal = await pillToken.balanceOf(wallet.address);

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const motoBalance: bigint = motoBal?.properties?.balance ?? motoBal?.result?.balance ?? 0n;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const pillBalance: bigint = pillBal?.properties?.balance ?? pillBal?.result?.balance ?? 0n;

console.log(`MOTO bal: ${motoBalance} (${Number(motoBalance) / 1e8})`);
console.log(`PILL bal: ${pillBalance} (${Number(pillBalance) / 1e8})`);

// Pick tokens based on which we hold
let auctioningToken: string;
let biddingToken: string;
let auctionedSellAmount: bigint;

if (motoBalance > 0n) {
    auctioningToken = MOTO;
    biddingToken = PILL;
    // Auction 10% of balance or 10 tokens, whichever is smaller
    const tenTokens = 10_00000000n;
    auctionedSellAmount = motoBalance < tenTokens ? motoBalance / 2n : tenTokens;
} else if (pillBalance > 0n) {
    auctioningToken = PILL;
    biddingToken = MOTO;
    const tenTokens = 10_00000000n;
    auctionedSellAmount = pillBalance < tenTokens ? pillBalance / 2n : tenTokens;
} else {
    console.error('\nNo MOTO or PILL tokens found in wallet.');
    console.error('Get testnet tokens from https://faucet.opnet.org/ or swap via MotoSwap.');
    process.exit(1);
}

console.log(`\nAuctioning: ${auctioningToken === MOTO ? 'MOTO' : 'PILL'}`);
console.log(`Bidding   : ${auctioningToken === MOTO ? 'PILL' : 'MOTO'}`);
console.log(`Amount    : ${Number(auctionedSellAmount) / 1e8}`);

// ── Resolve contract address to public key for approve() ─────────────────────
const rawKeys = await provider.getPublicKeysInfoRaw([contractAddress]);
const contractInfo = rawKeys[contractAddress];
if (!contractInfo?.tweakedPubkey) {
    console.error('Could not resolve contract public key. Contract may not be deployed yet.');
    process.exit(1);
}
const contractAddr = Address.fromString('0x' + contractInfo.tweakedPubkey);
console.log(`Contract pubkey: 0x${contractInfo.tweakedPubkey}`);

// ── Approve auctioning token ─────────────────────────────────────────────────
console.log('\nApproving auctioning token...');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const auctionToken = getContract(auctioningToken, OP_20_ABI, provider, network, wallet.address) as any;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const approveSim = await auctionToken.increaseAllowance(contractAddr, auctionedSellAmount);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
if (approveSim.revert) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.error('Approve would revert:', approveSim.revert);
    process.exit(1);
}
console.log('Approve simulation OK, sending...');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const approveReceipt = await approveSim.sendTransaction(txParams);
console.log('Approve TX sent:', approveReceipt);

// ── Create auction ───────────────────────────────────────────────────────────
console.log('\nCreating auction...');

// Contract uses Blockchain.block.medianTimestamp (milliseconds)
const now = BigInt(Date.now());
console.log(`Now     : ${now} (${new Date(Number(now)).toISOString()})`);
const cancellationEndDate = now + 3_600_000n;   // 1 hour from now
const auctionEndDate = now + 7_200_000n;        // 2 hours from now
const minBuyAmount = auctionedSellAmount / 10n; // 10:1 minimum price
const minimumBiddingAmountPerOrder = 1_00000000n; // 1 token minimum bid
const minFundingThreshold = 0n;            // no minimum funding
const isAtomicClosureAllowed = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opnosis = getContract(contractAddress, OPNOSIS_ABI, provider, network, wallet.address) as any;

const auctioningTokenAddr = Address.fromString(auctioningToken);
const biddingTokenAddr = Address.fromString(biddingToken);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const auctionSim = await opnosis.initiateAuction(
    auctioningTokenAddr,
    biddingTokenAddr,
    cancellationEndDate,
    auctionEndDate,
    auctionedSellAmount,
    minBuyAmount,
    minimumBiddingAmountPerOrder,
    minFundingThreshold,
    isAtomicClosureAllowed,
);

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
if (auctionSim.revert) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.error('Auction creation would revert:', auctionSim.revert);
    process.exit(1);
}

console.log('Simulation OK, sending transaction...');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const auctionReceipt = await auctionSim.sendTransaction(txParams);

console.log('\n=== Auction created ===');
console.log('Receipt:', auctionReceipt);
console.log(`\nAuctioning: ${auctioningToken === MOTO ? 'MOTO' : 'PILL'} (${Number(auctionedSellAmount) / 1e8} tokens)`);
console.log(`Bidding   : ${auctioningToken === MOTO ? 'PILL' : 'MOTO'}`);
console.log(`Cancel by : ${new Date(Number(cancellationEndDate) * 1000).toLocaleString()}`);
console.log(`Ends      : ${new Date(Number(auctionEndDate) * 1000).toLocaleString()}`);
