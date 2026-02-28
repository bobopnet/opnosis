/**
 * Create a test auction on OPNet testnet.
 *
 * Usage: npx tsx scripts/create-auction.ts
 *
 * Auctions LINK with MOTO as the bidding token.
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
console.log(`LINK    : ${tokenAddress}`);

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
    console.error('Could not resolve LINK token public key. Token may not be deployed yet.');
    console.error('Run: npx tsx scripts/check-token.ts');
    process.exit(1);
}
const linkHex = '0x' + tokenInfo.tweakedPubkey;
console.log(`Token pk: ${linkHex}`);

// ── Check token balance ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linkToken = getContract(linkHex, OP_20_ABI, provider, network, wallet.address) as any;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const linkBal = await linkToken.balanceOf(wallet.address);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const linkBalance: bigint = linkBal?.properties?.balance ?? linkBal?.result?.balance ?? 0n;
console.log(`Token bal: ${linkBalance} (${Number(linkBalance) / 1e18})`);

if (linkBalance <= 0n) {
    console.error('\nNo LINK tokens found in wallet.');
    process.exit(1);
}

const auctioningToken = linkHex;
const biddingToken = MOTO;
const TOKEN_DECIMALS = 18;
const auctionedSellAmount = 497_000n * 10n ** BigInt(TOKEN_DECIMALS);
// Contract charges 0.3% fee deposit on top of auctionedSellAmount
const feeDeposit = auctionedSellAmount * 3n / 1000n;
const totalDeposit = auctionedSellAmount + feeDeposit;

console.log(`\nAuctioning: LINK`);
console.log(`Bidding   : MOTO`);
console.log(`Amount    : ${Number(auctionedSellAmount) / (10 ** TOKEN_DECIMALS)} (+ ${Number(feeDeposit) / (10 ** TOKEN_DECIMALS)} fee deposit = ${Number(totalDeposit) / (10 ** TOKEN_DECIMALS)})`);

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
const auctionTokenContract = getContract(auctioningToken, OP_20_ABI, provider, network, wallet.address) as any;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
const existingAllowance = await auctionTokenContract.allowance(wallet.address, contractAddr);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const currentAllowance: bigint = existingAllowance?.properties?.remaining ?? existingAllowance?.result?.remaining ?? 0n;
console.log(`\nCurrent allowance: ${currentAllowance} (need ${totalDeposit})`);

if (currentAllowance < totalDeposit) {
    // ── Approve auctioning token (includes 0.3% fee deposit) ────────────────
    const needed = totalDeposit - currentAllowance;
    console.log(`Approving ${needed} more...`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const approveSim = await auctionTokenContract.increaseAllowance(contractAddr, needed);
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
            const chk = await auctionTokenContract.allowance(wallet.address, contractAddr);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const val: bigint = chk?.properties?.remaining ?? chk?.result?.remaining ?? 0n;
            console.log(`  Attempt ${attempt}: allowance = ${val}`);
            if (val >= totalDeposit) {
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

// Use blockchain's block time as reference (can be hours ahead of wall clock)
const currentBlock = await provider.getBlock(await provider.getBlockNumber());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const b = currentBlock as any;
const blockTime = BigInt(b.time ?? b.medianTime ?? Date.now());
console.log(`Block time : ${blockTime} (${new Date(Number(blockTime)).toISOString()})`);
console.log(`Median time: ${b.medianTime} (${new Date(Number(b.medianTime)).toISOString()})`);
console.log(`Wall clock : ${Date.now()} (${new Date().toISOString()})`);

const cancellationEndDate = blockTime;                  // no cancel window
const auctionEndDate = blockTime + 30n * 60_000n;       // 30 minutes from block time
const minBuyAmount = 497_000n * 10n ** 18n;             // 1 MOTO per token reserve (497K MOTO for 497K LINK)
const minimumBiddingAmountPerOrder = 1n * 10n ** 18n;   // 1 MOTO minimum bid
const minFundingThreshold = 100_000n * 10n ** 18n;      // 100K MOTO minimum funding
const isAtomicClosureAllowed = false;

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
console.log(`\nAuctioning: LINK (${Number(auctionedSellAmount) / (10 ** TOKEN_DECIMALS)} tokens)`);
console.log(`Bidding   : MOTO`);
console.log(`Cancel by : ${cancellationEndDate === blockTime ? 'N/A (no cancel window)' : new Date(Number(cancellationEndDate)).toLocaleString()}`);
console.log(`Ends      : ${new Date(Number(auctionEndDate)).toLocaleString()}`);
console.log(`Atomic    : ${isAtomicClosureAllowed}`);
