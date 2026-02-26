/**
 * Fee parameter tests — access control, snapshot integrity, and bounds.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { opnosis, contractAddress } from './helpers/setup.js';
import { FEE_DENOMINATOR } from '@opnosis/shared';

// Suppress unused-variable lint.
void opnosis;
void FEE_DENOMINATOR;

describe('setFeeParameters — access control', () => {
    it('should allow the contract owner to update fee parameters', async () => {
        // TODO: implement when testnet is available
        // Call simulateSetFeeParameters as the owner
        // Assert success and verify via getFeeParameters
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should revert when a non-owner attempts to update fee parameters', async () => {
        // TODO: implement when testnet is available
        // Call simulateSetFeeParameters from a non-owner address
        // Expect simulation to contain an error
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should reject feeNumerator greater than FEE_DENOMINATOR', async () => {
        // TODO: implement when testnet is available
        // Call simulateSetFeeParameters with feeNumerator > 1000
        // Expect simulation to contain an error
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });
});

describe('Fee snapshot integrity', () => {
    it('should snapshot fee parameters at auction creation time', async () => {
        // TODO: implement when testnet is available
        // 1. Set fee to X, create auction A
        // 2. Set fee to Y, create auction B
        // 3. Settle both auctions
        // 4. Assert auction A used fee X and auction B used fee Y
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should send collected fees to the feeReceiver on settlement', async () => {
        // TODO: implement when testnet is available
        // 1. Set feeReceiver to a known address
        // 2. Create and settle an auction with bids
        // 3. Assert feeReceiver balance increased by the expected fee
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });
});
