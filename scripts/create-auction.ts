/**
 * Create a test auction on OPNet testnet.
 *
 * Usage: npx tsx scripts/create-auction.ts
 *
 * Auctions OrangeCoin (ORNGE) with MOTO as the bidding token.
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

// ── Config ───────────────────────────────────────────────────────────────────
const mnemonic = process.env['MNEMONIC'];
if (!mnemonic) { console.error('MNEMONIC not set in .env'); process.exit(1); }

const contractAddress = process.env['OPNOSIS_CONTRACT'];
if (!contractAddress) { console.error('OPNOSIS_CONTRACT not set in .env'); process.exit(1); }

const tokenAddress = process.env['TOKEN_ADDRESS'];
if (!tokenAddress) { console.error('TOKEN_ADDRESS not set in .env'); process.exit(1); }

const network = networks.opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

const mnemonicObj = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonicObj.deriveOPWallet(AddressTypes.P2TR, 0);
console.log(`Wallet  : ${wallet.p2tr}`);
console.log(`Opnosis : ${contractAddress}`);
console.log(`ORNGE   : ${tokenAddress}`);

// ── Transaction params for backend signing ───────────────────────────────────
const txParams: TransactionParameters = {
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    maximumAllowedSatToSpend: 50_000n,
    feeRate: 10,
    network,
};

// ── Resolve hex addresses via provider ───────────────────────────────────────
// Resolve hex addresses via provider
const rawKeys = await provider.getPublicKeysInfoRaw([tokenAddress]);
const tokenInfo = rawKeys[tokenAddress];
if (!tokenInfo?.tweakedPubkey) {
    console.error('Could not resolve ORNGE token public key. Token may not be deployed yet.');
    console.error('Run: npx tsx scripts/check-token.ts');
    process.exit(1);
}
const orngeHex = '0x' + tokenInfo.tweakedPubkey;
console.log(`ORNGE pk: ${orngeHex}`);

// ── Check ORNGE balance ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orngeToken = getContract(orngeHex, OP_20_ABI, provider, network, wallet.address) as any;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const orngeBal = await orngeToken.balanceOf(wallet.address);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const orngeBalance: bigint = orngeBal?.properties?.balance ?? orngeBal?.result?.balance ?? 0n;
console.log(`ORNGE bal: ${orngeBalance} (${Number(orngeBalance) / 1e8})`);

if (orngeBalance <= 0n) {
    console.error('\nNo ORNGE tokens found in wallet. Was the token deployed correctly?');
    process.exit(1);
}

const auctioningToken = orngeHex;
const biddingToken = MOTO;
// Auction 10M ORNGE (10,000,000 * 10^8)
const auctionedSellAmount = 10_000_000_00000000n;

console.log(`\nAuctioning: ORNGE`);
console.log(`Bidding   : MOTO`);
console.log(`Amount    : ${Number(auctionedSellAmount) / 1e8}`);

// ── Resolve Opnosis contract address to public key for approve() ─────────────
const opnosisKeys = await provider.getPublicKeysInfoRaw([contractAddress]);
const contractInfo = opnosisKeys[contractAddress];
if (!contractInfo?.tweakedPubkey) {
    console.error('Could not resolve Opnosis contract public key. Contract may not be deployed yet.');
    process.exit(1);
}
const contractAddr = Address.fromString('0x' + contractInfo.tweakedPubkey);
console.log(`Opnosis pk: 0x${contractInfo.tweakedPubkey}`);

// ── Check existing allowance ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const auctionToken = getContract(auctioningToken, OP_20_ABI, provider, network, wallet.address) as any;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const existingAllowance = await auctionToken.allowance(wallet.address, contractAddr);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const currentAllowance: bigint = existingAllowance?.properties?.remaining ?? existingAllowance?.result?.remaining ?? 0n;
console.log(`\nCurrent allowance: ${currentAllowance} (need ${auctionedSellAmount})`);

if (currentAllowance < auctionedSellAmount) {
    // ── Approve auctioning token ─────────────────────────────────────────────
    const needed = auctionedSellAmount - currentAllowance;
    console.log(`Approving ${needed} more...`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const approveSim = await auctionToken.increaseAllowance(contractAddr, needed);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (approveSim.revert) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        console.error('Approve would revert:', approveSim.revert);
        process.exit(1);
    }
    console.log('Approve simulation OK, sending...');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const approveReceipt = await approveSim.sendTransaction(txParams);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log(`Approve TX: ${approveReceipt.transactionId}`);

    // ── Wait for approve to confirm ─────────────────────────────────────────
    console.log('\nWaiting for approve TX to confirm (need 1 block)...');
    for (let attempt = 1; attempt <= 30; attempt++) {
        await new Promise((r) => setTimeout(r, 30_000));
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const chk = await auctionToken.allowance(wallet.address, contractAddr);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const val: bigint = chk?.properties?.remaining ?? chk?.result?.remaining ?? 0n;
            console.log(`  Attempt ${attempt}: allowance = ${val}`);
            if (val >= auctionedSellAmount) {
                console.log('Allowance confirmed!');
                break;
            }
        } catch {
            console.log(`  Attempt ${attempt}: checking...`);
        }
        if (attempt === 30) {
            console.error('Timed out waiting for approve confirmation.');
            process.exit(1);
        }
    }
} else {
    console.log('Allowance already sufficient, skipping approve.');
}

// ── Create auction ───────────────────────────────────────────────────────────
console.log('\nCreating auction...');

// Contract uses Blockchain.block.medianTimestamp (milliseconds)
const now = BigInt(Date.now());
console.log(`Now     : ${now} (${new Date(Number(now)).toISOString()})`);
const cancellationEndDate = now + 3_600_000n;   // 1 hour from now
const auctionEndDate = now + 7_200_000n;        // 2 hours from now
const minBuyAmount = auctionedSellAmount / 10n; // 10:1 minimum price
const minimumBiddingAmountPerOrder = 1_00000000n; // 1 token minimum bid
const minFundingThreshold = 1_000_000_00000000n; // 1M MOTO minimum funding
const isAtomicClosureAllowed = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opnosis = getContract(contractAddress, OPNOSIS_ABI, provider, network, wallet.address) as any;

const auctioningTokenAddr = Address.fromString(auctioningToken);
const biddingTokenAddr = Address.fromString(biddingToken);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const orderPlacementStartDate = 0n; // start immediately
const auctionSim = await opnosis.initiateAuction(
    auctioningTokenAddr,
    biddingTokenAddr,
    orderPlacementStartDate,
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
console.log(`\nAuctioning: ORNGE (${Number(auctionedSellAmount) / 1e8} tokens)`);
console.log(`Bidding   : MOTO`);
console.log(`Cancel by : ${new Date(Number(cancellationEndDate)).toLocaleString()}`);
console.log(`Ends      : ${new Date(Number(auctionEndDate)).toLocaleString()}`);
