/**
 * Known OP-20 tokens for the token selector dropdown.
 *
 * Only tokens that can be used as auctioning/bidding tokens are listed here.
 * Router, factory, and staking contracts are NOT included.
 */

export interface KnownToken {
    readonly symbol: string;
    readonly name: string;
    readonly decimals: number;
    readonly testnet: string;
    readonly mainnet: string;
}

export const KNOWN_TOKENS: readonly KnownToken[] = [
    {
        symbol: 'MOTO',
        name: 'Moto',
        decimals: 8,
        testnet: '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd',
        mainnet: '',
    },
    {
        symbol: 'PILL',
        name: 'Pill',
        decimals: 8,
        testnet: '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb',
        mainnet: '',
    },
];
