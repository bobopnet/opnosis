/**
 * useOpnosis — contract interaction hook.
 *
 * Each method: simulate → check error → sendTransaction({ signer: null, mldsaSigner: null })
 */

import { useState, useMemo, useCallback } from 'react';
import type { AbstractRpcProvider } from 'opnet';
import { getContract } from 'opnet';
import type { Network } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import {
    OpnosisContract,
    OP_20_ABI,
} from '@opnosis/shared';
import type { SimResult, TxState } from '@opnosis/shared';
import { IDLE_TX } from '@opnosis/shared';
import { OPNOSIS_CONTRACT } from '../constants.js';

interface UseOpnosisReturn {
    readonly txState: TxState;
    readonly resetTx: () => void;
    readonly hexAddress: string;
    readonly completedKeys: Map<string, 'claimed' | 'cancelled'>;
    readonly markCompleted: (key: string, action: 'claimed' | 'cancelled') => void;
    readonly createAuction: (params: {
        auctioningToken: string;
        biddingToken: string;
        orderPlacementStartDate: bigint;
        cancellationEndDate: bigint;
        auctionEndDate: bigint;
        auctionedSellAmount: bigint;
        minBuyAmount: bigint;
        minimumBiddingAmountPerOrder: bigint;
        minFundingThreshold: bigint;
        isAtomicClosureAllowed: boolean;
    }) => Promise<boolean>;
    readonly placeOrders: (auctionId: bigint, minBuyAmounts: bigint[], sellAmounts: bigint[]) => Promise<boolean>;
    readonly cancelOrders: (auctionId: bigint, orderIds: bigint[]) => Promise<boolean>;
    readonly settleAuction: (auctionId: bigint) => Promise<boolean>;
    readonly claimOrders: (auctionId: bigint, orderIds: bigint[]) => Promise<boolean>;
    readonly extendAuction: (auctionId: bigint, newCancellationEndDate: bigint, newAuctionEndDate: bigint) => Promise<boolean>;
    readonly approveToken: (tokenAddress: string, amount: bigint) => Promise<boolean>;
}

export function useOpnosis(
    provider: AbstractRpcProvider | null,
    btcNetwork: Network | null,
    address: Address | null,
    walletAddress?: string,
): UseOpnosisReturn {
    const [txState, setTxState] = useState<TxState>(IDLE_TX);
    const [completedKeys, setCompletedKeys] = useState<Map<string, 'claimed' | 'cancelled'>>(new Map());
    const markCompleted = useCallback((key: string, action: 'claimed' | 'cancelled') => {
        setCompletedKeys((prev) => new Map(prev).set(key, action));
    }, []);

    const contract = useMemo(() => {
        if (!provider || !btcNetwork || !OPNOSIS_CONTRACT) return null;
        return new OpnosisContract(OPNOSIS_CONTRACT, provider, btcNetwork, address ?? undefined);
    }, [provider, btcNetwork, address]);

    const resetTx = useCallback(() => setTxState(IDLE_TX), []);

    async function sendSimulation(simulation: SimResult): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (simulation && 'error' in simulation) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            throw new Error(String(simulation.error));
        }
        // CallResult.sendTransaction() handles signing via OP_WALLET internally.
        // signer/mldsaSigner = null → wallet extension signs the transaction.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        const receipt = await simulation.sendTransaction({ signer: null, mldsaSigner: null, maximumAllowedSatToSpend: 0n, refundTo: walletAddress });

        // broadcast success: true only means mempool accepted it — check receipt for execution result
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (receipt && typeof receipt === 'object') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (receipt.error) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                throw new Error(`Transaction failed: ${String(receipt.error)}`);
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (receipt.revert) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                throw new Error(`Transaction reverted: ${String(receipt.revert)}`);
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if ('success' in receipt && receipt.success === false) {
                throw new Error('Transaction was not successful');
            }
        }
    }

    const createAuction: UseOpnosisReturn['createAuction'] = useCallback(async (params) => {
        if (!contract) { setTxState({ status: 'error', message: 'Contract not initialized' }); return false; }
        setTxState({ status: 'pending', message: 'Simulating auction creation...' });
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const sim = await contract.simulateInitiateAuction(
                params.auctioningToken,
                params.biddingToken,
                params.orderPlacementStartDate,
                params.cancellationEndDate,
                params.auctionEndDate,
                params.auctionedSellAmount,
                params.minBuyAmount,
                params.minimumBiddingAmountPerOrder,
                params.minFundingThreshold,
                params.isAtomicClosureAllowed,
            );
            setTxState({ status: 'pending', message: 'Confirm in OP_WALLET...' });
            await sendSimulation(sim);
            setTxState({ status: 'success', message: 'Auction created!' });
            return true;
        } catch (err) {
            setTxState({ status: 'error', message: err instanceof Error ? err.message : 'Failed' });
            return false;
        }
    }, [contract]);

    const placeOrders: UseOpnosisReturn['placeOrders'] = useCallback(async (auctionId, minBuyAmounts, sellAmounts) => {
        if (!contract) { setTxState({ status: 'error', message: 'Contract not initialized' }); return false; }
        setTxState({ status: 'pending', message: 'Simulating order placement...' });
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const sim = await contract.simulatePlaceSellOrders(auctionId, minBuyAmounts, sellAmounts);
            setTxState({ status: 'pending', message: 'Confirm in OP_WALLET...' });
            await sendSimulation(sim);
            setTxState({ status: 'success', message: 'Order placed!' });
            return true;
        } catch (err) {
            setTxState({ status: 'error', message: err instanceof Error ? err.message : 'Failed' });
            return false;
        }
    }, [contract]);

    const cancelOrders: UseOpnosisReturn['cancelOrders'] = useCallback(async (auctionId, orderIds) => {
        if (!contract) { setTxState({ status: 'error', message: 'Contract not initialized' }); return false; }
        setTxState({ status: 'pending', message: 'Simulating order cancellation...' });
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const sim = await contract.simulateCancelSellOrders(auctionId, orderIds);
            setTxState({ status: 'pending', message: 'Confirm in OP_WALLET...' });
            await sendSimulation(sim);
            setTxState({ status: 'success', message: 'Order cancelled!' });
            return true;
        } catch (err) {
            setTxState({ status: 'error', message: err instanceof Error ? err.message : 'Failed' });
            return false;
        }
    }, [contract]);

    const settleAuction: UseOpnosisReturn['settleAuction'] = useCallback(async (auctionId) => {
        if (!contract) { setTxState({ status: 'error', message: 'Contract not initialized' }); return false; }
        setTxState({ status: 'pending', message: 'Simulating settlement...' });
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const sim = await contract.simulateSettle(auctionId);
            setTxState({ status: 'pending', message: 'Confirm in OP_WALLET...' });
            await sendSimulation(sim);
            setTxState({ status: 'success', message: 'Auction settled!' });
            return true;
        } catch (err) {
            setTxState({ status: 'error', message: err instanceof Error ? err.message : 'Failed' });
            return false;
        }
    }, [contract]);

    const claimOrders: UseOpnosisReturn['claimOrders'] = useCallback(async (auctionId, orderIds) => {
        if (!contract) { setTxState({ status: 'error', message: 'Contract not initialized' }); return false; }
        setTxState({ status: 'pending', message: 'Simulating claim...' });
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const sim = await contract.simulateClaimFromParticipantOrder(auctionId, orderIds);
            setTxState({ status: 'pending', message: 'Confirm in OP_WALLET...' });
            await sendSimulation(sim);
            setTxState({ status: 'success', message: 'Tokens claimed!' });
            return true;
        } catch (err) {
            setTxState({ status: 'error', message: err instanceof Error ? err.message : 'Failed' });
            return false;
        }
    }, [contract]);

    const extendAuction: UseOpnosisReturn['extendAuction'] = useCallback(async (auctionId, newCancellationEndDate, newAuctionEndDate) => {
        if (!contract) { setTxState({ status: 'error', message: 'Contract not initialized' }); return false; }
        setTxState({ status: 'pending', message: 'Simulating auction extension...' });
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const sim = await contract.simulateExtendAuction(auctionId, newCancellationEndDate, newAuctionEndDate);
            setTxState({ status: 'pending', message: 'Confirm in OP_WALLET...' });
            await sendSimulation(sim);
            setTxState({ status: 'success', message: 'Auction extended!' });
            return true;
        } catch (err) {
            setTxState({ status: 'error', message: err instanceof Error ? err.message : 'Failed' });
            return false;
        }
    }, [contract]);

    const approveToken: UseOpnosisReturn['approveToken'] = useCallback(async (tokenAddress, amount) => {
        if (!provider || !btcNetwork) { setTxState({ status: 'error', message: 'Provider not initialized' }); return false; }
        if (!address) { setTxState({ status: 'error', message: 'Wallet not connected' }); return false; }
        setTxState({ status: 'pending', message: 'Resolving contract address...' });
        try {
            // Resolve Opnosis contract bech32 → Address for the spender
            const contractKeys = await provider.getPublicKeysInfoRaw([OPNOSIS_CONTRACT]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contractInfo = contractKeys[OPNOSIS_CONTRACT] as any;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (!contractInfo?.tweakedPubkey) {
                setTxState({ status: 'error', message: 'Could not resolve Opnosis contract public key' });
                return false;
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const spenderMldsa: string = contractInfo.mldsaHashedPublicKey || contractInfo.tweakedPubkey;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const spenderAddr = Address.fromString('0x' + spenderMldsa, '0x' + contractInfo.tweakedPubkey);

            setTxState({ status: 'pending', message: 'Simulating approval...' });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const token = getContract(tokenAddress, OP_20_ABI, provider, btcNetwork, address) as any;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const sim = await token.increaseAllowance(spenderAddr, amount);
            setTxState({ status: 'pending', message: 'Confirm approval in OP_WALLET...' });
            await sendSimulation(sim);

            // Wait for approval TX to confirm on-chain before returning
            setTxState({ status: 'pending', message: 'Waiting for approval to confirm...' });
            for (let attempt = 0; attempt < 40; attempt++) {
                await new Promise((r) => setTimeout(r, 15_000));
                try {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                    const chk = await token.allowance(address, spenderAddr);
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const val: bigint = chk?.properties?.remaining ?? chk?.result?.remaining ?? 0n;
                    if (val >= amount) {
                        setTxState({ status: 'success', message: 'Token approved!' });
                        return true;
                    }
                } catch {
                    // RPC hiccup — keep polling
                }
                setTxState({ status: 'pending', message: `Waiting for approval to confirm (${attempt + 1})...` });
            }
            setTxState({ status: 'error', message: 'Approval timed out — try placing the bid again' });
            return false;
        } catch (err) {
            setTxState({ status: 'error', message: err instanceof Error ? err.message : 'Failed' });
            return false;
        }
    }, [provider, btcNetwork, address]);

    const hexAddress = address?.toString() ?? '';

    return { txState, resetTx, hexAddress, completedKeys, markCompleted, createAuction, placeOrders, cancelOrders, settleAuction, claimOrders, extendAuction, approveToken };
}
