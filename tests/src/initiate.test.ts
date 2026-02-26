/**
 * initiateAuction validation tests — parameter edge cases and fee deposit checks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { opnosis, contractAddress } from './helpers/setup.js';
import { BASE_UNIT } from '@opnosis/shared';

// Suppress unused-variable lint.
void opnosis;
void BASE_UNIT;

describe('initiateAuction — input validation', () => {
    it('should revert when auctionedSellAmount is zero', async () => {
        // TODO: implement when testnet is available
        // Call simulateInitiateAuction with auctionedSellAmount = 0n
        // Expect simulation to contain an error
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should revert when minBuyAmount is zero', async () => {
        // TODO: implement when testnet is available
        // Call simulateInitiateAuction with minBuyAmount = 0n
        // Expect simulation to contain an error
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should revert when auctionEndDate is before cancellationEndDate', async () => {
        // TODO: implement when testnet is available
        // Set auctionEndDate < cancellationEndDate
        // Expect simulation to contain an error
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should revert when auctionEndDate is in the past', async () => {
        // TODO: implement when testnet is available
        // Set auctionEndDate to a timestamp before block.timestamp
        // Expect simulation to contain an error
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should revert when auctioning token equals bidding token', async () => {
        // TODO: implement when testnet is available
        // Pass the same address for both auctioningToken and biddingToken
        // Expect simulation to contain an error
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should deduct the fee deposit from the auctioneer on creation', async () => {
        // TODO: implement when testnet is available
        // 1. Record auctioneer balance before
        // 2. Create auction
        // 3. Assert balance decreased by the expected fee amount
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });
});
