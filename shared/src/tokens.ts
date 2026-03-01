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
    /** If true, this token can only be used for bidding, not auctioning. */
    readonly biddingOnly?: boolean;
}

export const KNOWN_TOKENS: readonly KnownToken[] = [
    {
        symbol: 'MOTO',
        name: 'Moto',
        decimals: 18,
        testnet: '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd',
        mainnet: '',
        biddingOnly: true,
    },
    {
        symbol: 'PILL',
        name: 'Pill',
        decimals: 18,
        testnet: '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb',
        mainnet: '',
        biddingOnly: true,
    },
    {
        symbol: 'ORNGE',
        name: 'Ornge',
        decimals: 8,
        testnet: '0x46c631ec33a79cf74bd87790c05d833f6604f90cca16cbb7c468c59c6a073b2a',
        mainnet: '',
    },
];
