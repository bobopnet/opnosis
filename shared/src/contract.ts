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
        auctioningToken: Address | string,
        biddingToken: Address | string,
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
    readonly recordAuctionClose: (auctionId: bigint) => Promise<SimResult>;
    readonly settleAuction: (auctionId: bigint) => Promise<SimResult>;
    readonly claimFromParticipantOrder: (
        auctionId: bigint,
        orderIds: readonly bigint[],
    ) => Promise<SimResult>;
    readonly extendAuction: (
        auctionId: bigint,
        newCancellationEndDate: bigint,
        newAuctionEndDate: bigint,
    ) => Promise<SimResult>;
    readonly setFeeParameters: (
        feeNumerator: bigint,
        feeReceiver: string,
    ) => Promise<SimResult>;
    readonly getUserId: (userAddress: string) => Promise<SimResult>;
    readonly getAuctionData: (auctionId: bigint) => Promise<SimResult>;
    readonly getClearingOrder: (auctionId: bigint) => Promise<SimResult>;
    readonly getAuctionOrders: (auctionId: bigint) => Promise<SimResult>;
    readonly getUserAddress: (userId: bigint) => Promise<SimResult>;
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

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /** Resolve a bech32 contract address to an Address object via provider. */
    async resolveAddress(bech32: string): Promise<Address> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keys = await this.#provider.getPublicKeysInfoRaw([bech32]) as any;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const info = keys[bech32];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!info?.tweakedPubkey) throw new Error(`Could not resolve address: ${bech32}`);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const mldsa: string = info.mldsaHashedPublicKey || info.tweakedPubkey;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return Address.fromString('0x' + mldsa, '0x' + info.tweakedPubkey);
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
        const [auctioningAddr, biddingAddr] = await Promise.all([
            this.resolveAddress(auctioningToken),
            this.resolveAddress(biddingToken),
        ]);
        return this.#contract.initiateAuction(
            auctioningAddr as unknown as string,
            biddingAddr as unknown as string,
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

    public async simulateRecordAuctionClose(auctionId: bigint): Promise<SimResult> {
        return this.#contract.recordAuctionClose(auctionId);
    }

    public async simulateSettle(auctionId: bigint): Promise<SimResult> {
        return this.#contract.settleAuction(auctionId);
    }

    public async simulateExtendAuction(
        auctionId: bigint,
        newCancellationEndDate: bigint,
        newAuctionEndDate: bigint,
    ): Promise<SimResult> {
        return this.#contract.extendAuction(auctionId, newCancellationEndDate, newAuctionEndDate);
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

    public async getAuctionOrders(auctionId: bigint): Promise<SimResult> {
        return this.#contract.getAuctionOrders(auctionId);
    }

    public async getUserAddress(userId: bigint): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result: SimResult = await this.#contract.getUserAddress(userId);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return String(result?.properties?.userAddress ?? '');
    }

    public async getFeeParameters(): Promise<{ feeNumerator: bigint }> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result: SimResult = await this.#contract.getFeeParameters();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return { feeNumerator: (result?.properties?.feeNumerator as bigint | undefined) ?? 0n };
    }
}
