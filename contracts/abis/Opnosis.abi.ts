import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const OpnosisEvents = [
    {
        name: 'NewAuction',
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'auctioningToken', type: ABIDataTypes.ADDRESS },
            { name: 'biddingToken', type: ABIDataTypes.ADDRESS },
            { name: 'auctioneerUserId', type: ABIDataTypes.UINT256 },
            { name: 'auctionedSellAmount', type: ABIDataTypes.UINT256 },
            { name: 'minBuyAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'NewSellOrder',
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'userId', type: ABIDataTypes.UINT256 },
            { name: 'buyAmount', type: ABIDataTypes.UINT256 },
            { name: 'sellAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'CancellationSellOrder',
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'userId', type: ABIDataTypes.UINT256 },
            { name: 'buyAmount', type: ABIDataTypes.UINT256 },
            { name: 'sellAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'AuctionCleared',
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'clearingBuyAmount', type: ABIDataTypes.UINT256 },
            { name: 'clearingSellAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'ClaimedFromOrder',
        values: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'userId', type: ABIDataTypes.UINT256 },
            { name: 'auctioningAmount', type: ABIDataTypes.UINT256 },
            { name: 'biddingAmount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'FeeParametersUpdated',
        values: [
            { name: 'feeNumerator', type: ABIDataTypes.UINT256 },
            { name: 'feeReceiver', type: ABIDataTypes.ADDRESS },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const OpnosisAbi = [
    {
        name: 'initiateAuction',
        inputs: [
            { name: 'auctioningToken', type: ABIDataTypes.ADDRESS },
            { name: 'biddingToken', type: ABIDataTypes.ADDRESS },
            { name: 'orderPlacementStartDate', type: ABIDataTypes.UINT256 },
            { name: 'cancellationEndDate', type: ABIDataTypes.UINT256 },
            { name: 'auctionEndDate', type: ABIDataTypes.UINT256 },
            { name: 'auctionedSellAmount', type: ABIDataTypes.UINT256 },
            { name: 'minBuyAmount', type: ABIDataTypes.UINT256 },
            { name: 'minimumBiddingAmountPerOrder', type: ABIDataTypes.UINT256 },
            { name: 'minFundingThreshold', type: ABIDataTypes.UINT256 },
            { name: 'isAtomicClosureAllowed', type: ABIDataTypes.BOOL },
        ],
        outputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'placeSellOrders',
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'minBuyAmounts', type: ABIDataTypes.ARRAY_OF_UINT256 },
            { name: 'sellAmounts', type: ABIDataTypes.ARRAY_OF_UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelSellOrders',
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'orderIds', type: ABIDataTypes.ARRAY_OF_UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'precalculateSellAmountSum',
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'iterationSteps', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'clearingFound', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'settleAuction',
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'clearingBuyAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimFromParticipantOrder',
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'orderIds', type: ABIDataTypes.ARRAY_OF_UINT256 },
        ],
        outputs: [{ name: 'totalAuctioning', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setFeeParameters',
        inputs: [
            { name: 'feeNumerator', type: ABIDataTypes.UINT256 },
            { name: 'feeReceiver', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getUserId',
        inputs: [{ name: 'userAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'userId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getAuctionData',
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'auctioningToken', type: ABIDataTypes.ADDRESS },
            { name: 'biddingToken', type: ABIDataTypes.ADDRESS },
            { name: 'orderPlacementStartDate', type: ABIDataTypes.UINT256 },
            { name: 'cancellationEndDate', type: ABIDataTypes.UINT256 },
            { name: 'auctionEndDate', type: ABIDataTypes.UINT256 },
            { name: 'auctionedSellAmount', type: ABIDataTypes.UINT256 },
            { name: 'minBuyAmount', type: ABIDataTypes.UINT256 },
            { name: 'minimumBiddingAmountPerOrder', type: ABIDataTypes.UINT256 },
            { name: 'feeNumerator', type: ABIDataTypes.UINT256 },
            { name: 'minFundingThreshold', type: ABIDataTypes.UINT256 },
            { name: 'isAtomicClosureAllowed', type: ABIDataTypes.BOOL },
            { name: 'orderCount', type: ABIDataTypes.UINT256 },
            { name: 'isSettled', type: ABIDataTypes.BOOL },
            { name: 'fundingNotReached', type: ABIDataTypes.BOOL },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getClearingOrder',
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'clearingBuyAmount', type: ABIDataTypes.UINT256 },
            { name: 'clearingSellAmount', type: ABIDataTypes.UINT256 },
            { name: 'volumeClearingPriceOrder', type: ABIDataTypes.UINT256 },
            { name: 'bidRaised', type: ABIDataTypes.UINT256 },
            { name: 'clearingOrderId', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getFeeParameters',
        inputs: [],
        outputs: [{ name: 'feeNumerator', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...OpnosisEvents,
    ...OP_NET_ABI,
];

export default OpnosisAbi;
