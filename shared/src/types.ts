/**
 * Shared types for Opnosis — derived from contracts/abis/Opnosis.d.ts.
 *
 * Re-declared here so consumers don't need @btc-vision/transaction directly.
 */

// ─── Event types ──────────────────────────────────────────────────────────────

export interface NewAuctionEvent {
    readonly auctionId: bigint;
    readonly auctioningToken: string;
    readonly biddingToken: string;
    readonly auctioneerUserId: bigint;
    readonly auctionedSellAmount: bigint;
    readonly minBuyAmount: bigint;
}

export interface NewSellOrderEvent {
    readonly auctionId: bigint;
    readonly userId: bigint;
    readonly buyAmount: bigint;
    readonly sellAmount: bigint;
}

export interface CancellationSellOrderEvent {
    readonly auctionId: bigint;
    readonly userId: bigint;
    readonly buyAmount: bigint;
    readonly sellAmount: bigint;
}

export interface AuctionClearedEvent {
    readonly auctionId: bigint;
    readonly clearingBuyAmount: bigint;
    readonly clearingSellAmount: bigint;
}

export interface ClaimedFromOrderEvent {
    readonly auctionId: bigint;
    readonly userId: bigint;
    readonly auctioningAmount: bigint;
    readonly biddingAmount: bigint;
}

export interface FeeParametersUpdatedEvent {
    readonly feeNumerator: bigint;
    readonly feeReceiver: string;
}

// ─── Auction data (parsed from getAuctionData result) ─────────────────────────

export interface AuctionData {
    readonly auctionId: bigint;
    readonly auctioningToken: string;
    readonly biddingToken: string;
    readonly auctionEndDate: bigint;
    readonly cancellationEndDate: bigint;
    readonly auctionedSellAmount: bigint;
    readonly minBuyAmount: bigint;
    readonly minimumBiddingAmountPerOrder: bigint;
    readonly minFundingThreshold: bigint;
    readonly isAtomicClosureAllowed: boolean;
    readonly orderCount: bigint;
    readonly isSettled: boolean;
}

// ─── Clearing data (parsed from getClearingOrder result) ──────────────────────

export interface ClearingData {
    readonly clearingBuyAmount: bigint;
    readonly clearingSellAmount: bigint;
}

// ─── UI types ─────────────────────────────────────────────────────────────────

export type AuctionStatus = 'open' | 'cancellation_closed' | 'ended' | 'settled';

export interface WalletState {
    readonly connected: boolean;
    readonly address: string;
    readonly network: string;
}

export type TxStatus = 'idle' | 'pending' | 'success' | 'error';

export interface TxState {
    readonly status: TxStatus;
    readonly message: string;
}

export const IDLE_TX: TxState = { status: 'idle', message: '' };
