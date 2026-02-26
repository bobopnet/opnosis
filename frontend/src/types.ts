/** Frontend-local types — re-exports from shared + UI-specific additions. */
import type { AuctionStatus } from '@opnosis/shared';

export type {
    WalletState,
    TxStatus,
    TxState,
    AuctionStatus,
    AuctionData,
    ClearingData,
} from '@opnosis/shared';
export { IDLE_TX } from '@opnosis/shared';

/** API response type for auction stats aggregates. */
export interface AuctionStats {
    readonly totalAuctions: number;
    readonly settledAuctions: number;
    readonly openAuctions: number;
    readonly failedAuctions: number;
    readonly totalVolume: string;
    readonly totalOrdersPlaced: number;
}

/** API response type for clearing data. */
export interface IndexedClearing {
    readonly clearingBuyAmount: string;
    readonly clearingSellAmount: string;
}

/** API response type for indexed auctions (all values are strings/booleans). */
export interface IndexedAuction {
    readonly id: string;
    readonly auctioningToken: string;
    readonly biddingToken: string;
    readonly auctionEndDate: string;
    readonly cancellationEndDate: string;
    readonly auctionedSellAmount: string;
    readonly minBuyAmount: string;
    readonly minimumBiddingAmountPerOrder: string;
    readonly minFundingThreshold: string;
    readonly isAtomicClosureAllowed: boolean;
    readonly orderCount: string;
    readonly isSettled: boolean;
    readonly status: AuctionStatus;
}
