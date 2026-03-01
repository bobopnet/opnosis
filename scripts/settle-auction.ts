/**
 * Manually settle auction #1 — diagnose why auto-settle may be failing.
 */
import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { Mnemonic, AddressTypes, MLDSASecurityLevel, TransactionParameters } from '@btc-vision/transaction';
import { getNetworkConfig, OpnosisContract } from '@opnosis/shared';

const networkName = process.env['NETWORK'] ?? 'testnet';
const networkConfig = getNetworkConfig(networkName);
const contractAddress = process.env['OPNOSIS_CONTRACT'] ?? '';
const mnemonic = process.env['MNEMONIC'] ?? '';

const provider = new JSONRpcProvider({ url: networkConfig.rpcUrl, network: networkConfig.btcNetwork });

async function main() {
    const auctionId = BigInt(process.argv[2] ?? '1');
    console.log(`Attempting to settle auction ${auctionId}...`);
    console.log(`Contract: ${contractAddress}`);
    console.log(`Network: ${networkName}`);

    const contract = new OpnosisContract(contractAddress, provider, networkConfig.btcNetwork);

    // Check auction state
    const data = await contract.getAuctionData(auctionId);
    console.log('\nAuction data (isSettled + status fields):');
    const props = (data as any).properties;
    console.log('  isSettled:', props?.isSettled);
    console.log('  auctionEndDate:', props?.auctionEndDate?.toString());
    console.log('  fundingNotReached:', props?.fundingNotReached);

    // Simulate
    console.log('\nSimulating settle...');
    const sim = await contract.simulateSettle(auctionId);
    console.log('Simulation result:', JSON.stringify(sim, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

    if ('error' in (sim as any)) {
        console.error('\nSimulation failed:', (sim as any).error);
        return;
    }

    // Send transaction
    const wallet = new Mnemonic(mnemonic, '', networkConfig.btcNetwork, MLDSASecurityLevel.LEVEL2)
        .deriveOPWallet(AddressTypes.P2TR, 0);

    const txParams: TransactionParameters = {
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: 50_000n,
        feeRate: 10,
        network: networkConfig.btcNetwork,
    };

    console.log('\nSending settle transaction...');
    const sendable = sim as { sendTransaction(params: TransactionParameters): Promise<unknown> };
    const result = await sendable.sendTransaction(txParams);
    console.log('Transaction sent:', JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
