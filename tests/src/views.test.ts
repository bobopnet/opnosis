/**
 * Read-only view function tests — getAuctionData, getClearingOrder, getFeeParameters, getUserId.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { opnosis, contractAddress } from './helpers/setup.js';

// Suppress unused-variable lint.
void opnosis;

describe('getAuctionData', () => {
    it('should return auction details for a valid auctionId', async () => {
        // TODO: implement when testnet is available
        // Create an auction, then query its data
        // Assert returned fields match the creation parameters
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should return default/zero values for a non-existent auctionId', async () => {
        // TODO: implement when testnet is available
        // Query auctionId = 999999n
        // Assert returned values are zero / empty
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });
});

describe('getClearingOrder', () => {
    it('should return clearing data after auction settlement', async () => {
        // TODO: implement when testnet is available
        // Settle an auction, then query clearing order
        // Assert clearingBuyAmount and clearingSellAmount are non-zero
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should return zeros for an unsettled auction', async () => {
        // TODO: implement when testnet is available
        // Query clearing order for an active (unsettled) auction
        // Assert clearingBuyAmount = 0
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });
});

describe('getFeeParameters', () => {
    it('should return current fee numerator', async () => {
        // TODO: implement when testnet is available
        // Query getFeeParameters
        // Assert feeNumerator is a valid bigint
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });
});

describe('getUserId', () => {
    it('should return a non-zero userId for an address that has interacted', async () => {
        // TODO: implement when testnet is available
        // Place an order from a known address, then query getUserId
        // Assert userId > 0
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should return zero for an address that has never interacted', async () => {
        // TODO: implement when testnet is available
        // Query getUserId for a fresh address
        // Assert userId = 0
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });
});
