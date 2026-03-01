/**
 * Opnosis ABI — matches contracts/abis/Opnosis.abi.json.
 *
 * Uses the proper BitcoinInterfaceAbi format with BitcoinAbiTypes.Function
 * and ABIDataTypes from the opnet SDK.
 */

import { ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

export const OPNOSIS_ABI: BitcoinInterfaceAbi = [
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
        name: 'recordAuctionClose',
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'blockHeight', type: ABIDataTypes.UINT256 }],
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
        constant: true,
        inputs: [{ name: 'userAddress', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'userId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getAuctionData',
        constant: true,
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
        constant: true,
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
        name: 'getAuctionOrders',
        constant: true,
        inputs: [{ name: 'auctionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'orderCount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getUserAddress',
        constant: true,
        inputs: [{ name: 'userId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'userAddress', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'extendAuction',
        inputs: [
            { name: 'auctionId', type: ABIDataTypes.UINT256 },
            { name: 'newCancellationEndDate', type: ABIDataTypes.UINT256 },
            { name: 'newAuctionEndDate', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getFeeParameters',
        constant: true,
        inputs: [],
        outputs: [{ name: 'feeNumerator', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
];
