/**
 * OpnosisContract — thin wrapper around opnet `getContract` (follows MotoCash pattern).
 *
 * Rules:
 *  - NEVER pass signer / mldsaSigner here (frontend responsibility).
 *  - All amounts as bigint (base units, 8 decimals).
 *  - Use simulate() BEFORE sendTransaction() — never skip it.
 */

import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import type { Network } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { OPNOSIS_ABI } from './abi.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SimResult = any;

interface OpnosisMethods {
    readonly initiateAuction: (
        auctioningToken: string,
        biddingToken: string,
        orderPlacementStartDate: bigint,
        cancellationEndDate: bigint,
        auctionEndDate: bigint,
        auctionedSellAmount: bigint,
        minBuyAmount: bigint,
        minimumBiddingAmountPerOrder: bigint,
        minFundingThreshold: bigint,
        isAtomicClosureAllowed: boolean,
    ) => Promise<SimResult>;
    readonly placeSellOrders: (
        auctionId: bigint,
        minBuyAmounts: readonly bigint[],
        sellAmounts: readonly bigint[],
    ) => Promise<SimResult>;
    readonly cancelSellOrders: (
        auctionId: bigint,
        orderIds: readonly bigint[],
    ) => Promise<SimResult>;
    readonly precalculateSellAmountSum: (
        auctionId: bigint,
        iterationSteps: bigint,
    ) => Promise<SimResult>;
    readonly settleAuction: (auctionId: bigint) => Promise<SimResult>;
    readonly claimFromParticipantOrder: (
        auctionId: bigint,
        orderIds: readonly bigint[],
    ) => Promise<SimResult>;
    readonly setFeeParameters: (
        feeNumerator: bigint,
        feeReceiver: string,
    ) => Promise<SimResult>;
    readonly getUserId: (userAddress: string) => Promise<SimResult>;
    readonly getAuctionData: (auctionId: bigint) => Promise<SimResult>;
    readonly getClearingOrder: (auctionId: bigint) => Promise<SimResult>;
    readonly getFeeParameters: () => Promise<SimResult>;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class OpnosisContract {
    static #cache = new Map<string, OpnosisMethods>();

    #contractAddress: string;
    #provider: AbstractRpcProvider;
    #network: Network;
    #sender: Address | undefined;

    public constructor(
        contractAddress: string,
        provider: AbstractRpcProvider,
        network: Network = networks.bitcoin,
        sender?: Address,
    ) {
        this.#contractAddress = contractAddress;
        this.#provider = provider;
        this.#network = network;
        this.#sender = sender;
    }

    get #contract(): OpnosisMethods {
        const key = `${this.#contractAddress}:${this.#network.bech32}:${this.#sender?.toString() ?? ''}`;
        const cached = OpnosisContract.#cache.get(key);
        if (cached !== undefined) return cached;

        const instance = getContract(
            this.#contractAddress,
            OPNOSIS_ABI,
            this.#provider,
            this.#network,
            this.#sender,
        ) as unknown as OpnosisMethods;

        OpnosisContract.#cache.set(key, instance);
        return instance;
    }

    // ── Write simulations (return raw SimResult for sendTransaction) ──────────

    public async simulateInitiateAuction(
        auctioningToken: string,
        biddingToken: string,
        orderPlacementStartDate: bigint,
        cancellationEndDate: bigint,
        auctionEndDate: bigint,
        auctionedSellAmount: bigint,
        minBuyAmount: bigint,
        minimumBiddingAmountPerOrder: bigint,
        minFundingThreshold: bigint,
        isAtomicClosureAllowed: boolean,
    ): Promise<SimResult> {
        return this.#contract.initiateAuction(
            auctioningToken,
            biddingToken,
            orderPlacementStartDate,
            cancellationEndDate,
            auctionEndDate,
            auctionedSellAmount,
            minBuyAmount,
            minimumBiddingAmountPerOrder,
            minFundingThreshold,
            isAtomicClosureAllowed,
        );
    }

    public async simulatePlaceSellOrders(
        auctionId: bigint,
        minBuyAmounts: readonly bigint[],
        sellAmounts: readonly bigint[],
    ): Promise<SimResult> {
        return this.#contract.placeSellOrders(auctionId, minBuyAmounts, sellAmounts);
    }

    public async simulateCancelSellOrders(
        auctionId: bigint,
        orderIds: readonly bigint[],
    ): Promise<SimResult> {
        return this.#contract.cancelSellOrders(auctionId, orderIds);
    }

    public async simulatePrecalculate(
        auctionId: bigint,
        iterationSteps: bigint,
    ): Promise<SimResult> {
        return this.#contract.precalculateSellAmountSum(auctionId, iterationSteps);
    }

    public async simulateSettle(auctionId: bigint): Promise<SimResult> {
        return this.#contract.settleAuction(auctionId);
    }

    public async simulateClaimFromParticipantOrder(
        auctionId: bigint,
        orderIds: readonly bigint[],
    ): Promise<SimResult> {
        return this.#contract.claimFromParticipantOrder(auctionId, orderIds);
    }

    public async simulateSetFeeParameters(
        feeNumerator: bigint,
        feeReceiver: string,
    ): Promise<SimResult> {
        return this.#contract.setFeeParameters(feeNumerator, feeReceiver);
    }

    // ── Read methods (return parsed data) ─────────────────────────────────────

    public async getUserId(userAddress: string): Promise<bigint> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result: SimResult = await this.#contract.getUserId(userAddress);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return (result?.properties?.userId as bigint | undefined) ?? 0n;
    }

    public async getAuctionData(auctionId: bigint): Promise<SimResult> {
        return this.#contract.getAuctionData(auctionId);
    }

    public async getClearingOrder(auctionId: bigint): Promise<SimResult> {
        return this.#contract.getClearingOrder(auctionId);
    }

    public async getFeeParameters(): Promise<{ feeNumerator: bigint }> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result: SimResult = await this.#contract.getFeeParameters();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return { feeNumerator: (result?.properties?.feeNumerator as bigint | undefined) ?? 0n };
    }
}
