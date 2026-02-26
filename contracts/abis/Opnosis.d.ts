import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type NewAuctionEvent = {
    readonly auctionId: bigint;
    readonly auctioningToken: Address;
    readonly biddingToken: Address;
    readonly auctioneerUserId: bigint;
    readonly auctionedSellAmount: bigint;
    readonly minBuyAmount: bigint;
};
export type NewSellOrderEvent = {
    readonly auctionId: bigint;
    readonly userId: bigint;
    readonly buyAmount: bigint;
    readonly sellAmount: bigint;
};
export type CancellationSellOrderEvent = {
    readonly auctionId: bigint;
    readonly userId: bigint;
    readonly buyAmount: bigint;
    readonly sellAmount: bigint;
};
export type AuctionClearedEvent = {
    readonly auctionId: bigint;
    readonly clearingBuyAmount: bigint;
    readonly clearingSellAmount: bigint;
};
export type ClaimedFromOrderEvent = {
    readonly auctionId: bigint;
    readonly userId: bigint;
    readonly auctioningAmount: bigint;
    readonly biddingAmount: bigint;
};
export type FeeParametersUpdatedEvent = {
    readonly feeNumerator: bigint;
    readonly feeReceiver: Address;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the initiateAuction function call.
 */
export type InitiateAuction = CallResult<
    {
        auctionId: bigint;
    },
    OPNetEvent<NewAuctionEvent>[]
>;

/**
 * @description Represents the result of the placeSellOrders function call.
 */
export type PlaceSellOrders = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<NewSellOrderEvent>[]
>;

/**
 * @description Represents the result of the cancelSellOrders function call.
 */
export type CancelSellOrders = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<CancellationSellOrderEvent>[]
>;

/**
 * @description Represents the result of the precalculateSellAmountSum function call.
 */
export type PrecalculateSellAmountSum = CallResult<
    {
        clearingFound: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the settleAuction function call.
 */
export type SettleAuction = CallResult<
    {
        clearingBuyAmount: bigint;
    },
    OPNetEvent<AuctionClearedEvent>[]
>;

/**
 * @description Represents the result of the claimFromParticipantOrder function call.
 */
export type ClaimFromParticipantOrder = CallResult<
    {
        totalAuctioning: bigint;
    },
    OPNetEvent<ClaimedFromOrderEvent>[]
>;

/**
 * @description Represents the result of the setFeeParameters function call.
 */
export type SetFeeParameters = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<FeeParametersUpdatedEvent>[]
>;

/**
 * @description Represents the result of the getUserId function call.
 */
export type GetUserId = CallResult<
    {
        userId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getAuctionData function call.
 */
export type GetAuctionData = CallResult<
    {
        auctioningToken: Address;
        biddingToken: Address;
        cancellationEndDate: bigint;
        auctionEndDate: bigint;
        auctionedSellAmount: bigint;
        minBuyAmount: bigint;
        minimumBiddingAmountPerOrder: bigint;
        feeNumerator: bigint;
        minFundingThreshold: bigint;
        isAtomicClosureAllowed: boolean;
        orderCount: bigint;
        isSettled: boolean;
        fundingNotReached: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getClearingOrder function call.
 */
export type GetClearingOrder = CallResult<
    {
        clearingBuyAmount: bigint;
        clearingSellAmount: bigint;
        volumeClearingPriceOrder: bigint;
        bidRaised: bigint;
        clearingOrderId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getFeeParameters function call.
 */
export type GetFeeParameters = CallResult<
    {
        feeNumerator: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IOpnosis
// ------------------------------------------------------------------
export interface IOpnosis extends IOP_NETContract {
    initiateAuction(
        auctioningToken: Address,
        biddingToken: Address,
        cancellationEndDate: bigint,
        auctionEndDate: bigint,
        auctionedSellAmount: bigint,
        minBuyAmount: bigint,
        minimumBiddingAmountPerOrder: bigint,
        minFundingThreshold: bigint,
        isAtomicClosureAllowed: boolean,
    ): Promise<InitiateAuction>;
    placeSellOrders(auctionId: bigint, minBuyAmounts: bigint[], sellAmounts: bigint[]): Promise<PlaceSellOrders>;
    cancelSellOrders(auctionId: bigint, orderIds: bigint[]): Promise<CancelSellOrders>;
    precalculateSellAmountSum(auctionId: bigint, iterationSteps: bigint): Promise<PrecalculateSellAmountSum>;
    settleAuction(auctionId: bigint): Promise<SettleAuction>;
    claimFromParticipantOrder(auctionId: bigint, orderIds: bigint[]): Promise<ClaimFromParticipantOrder>;
    setFeeParameters(feeNumerator: bigint, feeReceiver: Address): Promise<SetFeeParameters>;
    getUserId(userAddress: Address): Promise<GetUserId>;
    getAuctionData(auctionId: bigint): Promise<GetAuctionData>;
    getClearingOrder(auctionId: bigint): Promise<GetClearingOrder>;
    getFeeParameters(): Promise<GetFeeParameters>;
}
