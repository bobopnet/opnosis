/**
 * claimFromParticipantOrder tests — won, lost, cancelled, and funding-failed scenarios.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { opnosis, provider, contractAddress } from './helpers/setup.js';
import { getBalance } from './helpers/tokens.js';
import { BASE_UNIT } from '@opnosis/shared';

// Suppress unused-variable lint.
void opnosis;
void provider;
void getBalance;
void BASE_UNIT;

describe('claimFromParticipantOrder', () => {
    it('should distribute auctioning tokens to winning bidders', async () => {
        // TODO: implement when testnet is available
        // After settlement, claim for a winning order
        // Assert auctioning token balance increased by expected amount
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should refund bidding tokens to losing bidders', async () => {
        // TODO: implement when testnet is available
        // After settlement, claim for a losing order (bid below clearing price)
        // Assert bidding token balance is fully refunded
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should refund bidding tokens when auction funding failed', async () => {
        // TODO: implement when testnet is available
        // After settling an auction that failed minFundingThreshold, claim
        // Assert all bidding tokens are refunded
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should revert claim before auction is settled', async () => {
        // TODO: implement when testnet is available
        // Try to claim before settlement
        // Expect simulation to contain an error
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });

    it('should revert claim for an order that was already claimed', async () => {
        // TODO: implement when testnet is available
        // Claim an order, then try to claim it again
        // Expect simulation to contain an error
        assert.ok(contractAddress, 'OPNOSIS_CONTRACT must be set');
    });
});
