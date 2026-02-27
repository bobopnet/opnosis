/**
 * useOpnosis — contract interaction hook.
 *
 * Each method: simulate → check error → sendTransaction({ signer: null, mldsaSigner: null })
 */

import { useState, useMemo, useCallback } from 'react';
import type { AbstractRpcProvider } from 'opnet';
import { getContract } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
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

export function useOpnosis(provider: AbstractRpcProvider | null, network: string): UseOpnosisReturn {
    const [txState, setTxState] = useState<TxState>(IDLE_TX);

    const contract = useMemo(() => {
        if (!provider || !OPNOSIS_CONTRACT) return null;
        const btcNetwork = network === 'mainnet' ? networks.bitcoin : networks.opnetTestnet;
        return new OpnosisContract(OPNOSIS_CONTRACT, provider, btcNetwork);
    }, [provider, network]);

    const resetTx = useCallback(() => setTxState(IDLE_TX), []);

    async function sendSimulation(simulation: SimResult): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (simulation && 'error' in simulation) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            throw new Error(String(simulation.error));
        }
        // CallResult.sendTransaction() handles signing via OP_WALLET internally.
        // signer/mldsaSigner = null → wallet extension signs the transaction.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await simulation.sendTransaction({ signer: null, mldsaSigner: null });
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
            setTxState({ status: 'success', message: 'Orders placed!' });
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
            setTxState({ status: 'success', message: 'Orders cancelled!' });
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
        if (!provider) { setTxState({ status: 'error', message: 'Provider not initialized' }); return false; }
        setTxState({ status: 'pending', message: 'Simulating approval...' });
        try {
            const btcNetwork = network === 'mainnet' ? networks.bitcoin : networks.opnetTestnet;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const token = getContract(tokenAddress, OP_20_ABI, provider, btcNetwork) as any;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const sim = await token.increaseAllowance.simulate(OPNOSIS_CONTRACT, amount);
            setTxState({ status: 'pending', message: 'Confirm approval in OP_WALLET...' });
            await sendSimulation(sim);
            setTxState({ status: 'success', message: 'Token approved!' });
            return true;
        } catch (err) {
            setTxState({ status: 'error', message: err instanceof Error ? err.message : 'Failed' });
            return false;
        }
    }, [provider, network]);

    return { txState, resetTx, createAuction, placeOrders, cancelOrders, settleAuction, claimOrders, extendAuction, approveToken };
}
