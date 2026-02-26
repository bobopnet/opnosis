import { Address, BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

// Maximum event data: 352 bytes. Keep payloads tight.
// All u256 fields = 32 bytes, Address = 32 bytes, u8 = 1 byte, bool = 1 byte.

// ─── NewAuction ──────────────────────────────────────────────────────────────
// Emitted when an auctioneer initiates a new batch auction.
// auctionId(32) + auctioningToken(32) + biddingToken(32) + auctioneerUserId(32)
//   + auctionedSellAmount(32) + minBuyAmount(32) = 192 bytes
@final
export class NewAuctionEvent extends NetEvent {
    constructor(
        auctionId: u256,
        auctioningToken: Address,
        biddingToken: Address,
        auctioneerUserId: u256,
        auctionedSellAmount: u256,
        minBuyAmount: u256,
    ) {
        const data = new BytesWriter(192);
        data.writeU256(auctionId);
        data.writeAddress(auctioningToken);
        data.writeAddress(biddingToken);
        data.writeU256(auctioneerUserId);
        data.writeU256(auctionedSellAmount);
        data.writeU256(minBuyAmount);
        super('NewAuction', data);
    }
}

// ─── NewSellOrder ─────────────────────────────────────────────────────────────
// Emitted when a bidder places a sell order.
// auctionId(32) + userId(32) + buyAmount(32) + sellAmount(32) = 128 bytes
@final
export class NewSellOrderEvent extends NetEvent {
    constructor(auctionId: u256, userId: u256, buyAmount: u256, sellAmount: u256) {
        const data = new BytesWriter(128);
        data.writeU256(auctionId);
        data.writeU256(userId);
        data.writeU256(buyAmount);
        data.writeU256(sellAmount);
        super('NewSellOrder', data);
    }
}

// ─── CancellationSellOrder ────────────────────────────────────────────────────
// Emitted when a bidder cancels their sell order.
// auctionId(32) + userId(32) + buyAmount(32) + sellAmount(32) = 128 bytes
@final
export class CancellationSellOrderEvent extends NetEvent {
    constructor(auctionId: u256, userId: u256, buyAmount: u256, sellAmount: u256) {
        const data = new BytesWriter(128);
        data.writeU256(auctionId);
        data.writeU256(userId);
        data.writeU256(buyAmount);
        data.writeU256(sellAmount);
        super('CancellationSellOrder', data);
    }
}

// ─── AuctionCleared ──────────────────────────────────────────────────────────
// Emitted when an auction is settled. Encodes the clearing price.
// auctionId(32) + clearingBuyAmount(32) + clearingSellAmount(32) = 96 bytes
@final
export class AuctionClearedEvent extends NetEvent {
    constructor(auctionId: u256, clearingBuyAmount: u256, clearingSellAmount: u256) {
        const data = new BytesWriter(96);
        data.writeU256(auctionId);
        data.writeU256(clearingBuyAmount);
        data.writeU256(clearingSellAmount);
        super('AuctionCleared', data);
    }
}

// ─── ClaimedFromOrder ─────────────────────────────────────────────────────────
// Emitted when a participant claims their tokens post-settlement.
// auctionId(32) + userId(32) + auctioningAmount(32) + biddingAmount(32) = 128 bytes
@final
export class ClaimedFromOrderEvent extends NetEvent {
    constructor(
        auctionId: u256,
        userId: u256,
        auctioningAmount: u256,
        biddingAmount: u256,
    ) {
        const data = new BytesWriter(128);
        data.writeU256(auctionId);
        data.writeU256(userId);
        data.writeU256(auctioningAmount);
        data.writeU256(biddingAmount);
        super('ClaimedFromOrder', data);
    }
}

// ─── NewUser ─────────────────────────────────────────────────────────────────
// Emitted when a new user ID is assigned.
// userId(32) + userAddress(32) = 64 bytes
@final
export class NewUserEvent extends NetEvent {
    constructor(userId: u256, userAddress: Address) {
        const data = new BytesWriter(64);
        data.writeU256(userId);
        data.writeAddress(userAddress);
        super('NewUser', data);
    }
}

// ─── FeeParametersUpdated ─────────────────────────────────────────────────────
// Emitted when the protocol fee parameters are changed by owner.
// feeNumerator(32) + feeReceiver(32) = 64 bytes
@final
export class FeeParametersUpdatedEvent extends NetEvent {
    constructor(feeNumerator: u256, feeReceiver: Address) {
        const data = new BytesWriter(64);
        data.writeU256(feeNumerator);
        data.writeAddress(feeReceiver);
        super('FeeParametersUpdated', data);
    }
}

// ─── AuctionFundingFailed ────────────────────────────────────────────────────
// Emitted when an auction settles below its minFundingThreshold.
// auctionId(32) + bidRaised(32) + minFundingThreshold(32) = 96 bytes
@final
export class AuctionFundingFailedEvent extends NetEvent {
    constructor(auctionId: u256, bidRaised: u256, minFundingThreshold: u256) {
        const data = new BytesWriter(96);
        data.writeU256(auctionId);
        data.writeU256(bidRaised);
        data.writeU256(minFundingThreshold);
        super('AuctionFundingFailed', data);
    }
}
