/**
 * OP20 token helpers for test setup (approve, check balance).
 */

import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { OP_20_ABI } from '@opnosis/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SimResult = any;

interface OP20Methods {
    readonly balanceOf: { simulate: (owner: string) => Promise<SimResult> };
    readonly allowance: { simulate: (owner: string, spender: string) => Promise<SimResult> };
    readonly increaseAllowance: { simulate: (spender: string, amount: bigint) => Promise<SimResult> };
    readonly decimals: { simulate: () => Promise<SimResult> };
    readonly symbol: { simulate: () => Promise<SimResult> };
}

function getOP20(tokenAddress: string, provider: AbstractRpcProvider): OP20Methods {
    return getContract(
        tokenAddress,
        OP_20_ABI,
        provider,
        networks.opnetTestnet,
    ) as unknown as OP20Methods;
}

export async function getBalance(tokenAddress: string, owner: string, provider: AbstractRpcProvider): Promise<bigint> {
    const token = getOP20(tokenAddress, provider);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result: SimResult = await token.balanceOf.simulate(owner);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (result?.result?.balance as bigint | undefined) ?? 0n;
}

export async function getAllowance(
    tokenAddress: string,
    owner: string,
    spender: string,
    provider: AbstractRpcProvider,
): Promise<bigint> {
    const token = getOP20(tokenAddress, provider);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result: SimResult = await token.allowance.simulate(owner, spender);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (result?.result?.remaining as bigint | undefined) ?? 0n;
}
