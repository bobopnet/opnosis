/**
 * useWallet — connect to OP_WALLET and expose a JSONRpcProvider + address.
 *
 * Architecture:
 *  - JSONRpcProvider: used for contract reads (simulate)
 *  - OP_WALLET (window.opnet): handles ALL signing via sendTransaction()
 *
 * NEVER use sendBitcoin() or UnisatSigner (both FORBIDDEN).
 * On sendTransaction(), always pass signer: null, mldsaSigner: null.
 */

import { useState, useCallback } from 'react';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import type { AbstractRpcProvider } from 'opnet';
import type { WalletState } from '../types.js';

const MAINNET_RPC = 'https://mainnet.opnet.org/v1/json-rpc';
const TESTNET_RPC = 'https://testnet.opnet.org/v1/json-rpc';

export interface UseWalletReturn {
    readonly wallet: WalletState;
    readonly provider: AbstractRpcProvider | null;
    readonly connect: () => Promise<void>;
    readonly disconnect: () => void;
    readonly error: string;
}

const DISCONNECTED: WalletState = {
    connected: false,
    address: '',
    network: '',
};

export function useWallet(): UseWalletReturn {
    const [wallet, setWallet] = useState<WalletState>(DISCONNECTED);
    const [provider, setProvider] = useState<AbstractRpcProvider | null>(null);
    const [error, setError] = useState<string>('');

    const connect = useCallback(async (): Promise<void> => {
        setError('');
        try {
            if (typeof window === 'undefined' || window.opnet === undefined) {
                setError('OP_WALLET not found. Please install the OP_WALLET browser extension.');
                return;
            }

            const accounts: string[] = await window.opnet.requestAccounts();
            if (accounts.length === 0) {
                setError('No accounts returned from OP_WALLET.');
                return;
            }

            const rawNetwork: string = await window.opnet.getNetwork();
            const isMainnet = rawNetwork === 'livenet' || rawNetwork === 'mainnet';
            const normalisedNetwork = isMainnet ? 'mainnet' : 'testnet';

            const rpcUrl = isMainnet ? MAINNET_RPC : TESTNET_RPC;
            // OPNet testnet uses opnetTestnet (opt1 bech32 prefix), not Bitcoin testnet.
            const btcNetwork = isMainnet ? networks.bitcoin : networks.opnetTestnet;
            console.log(`OP_WALLET network: ${rawNetwork} → ${normalisedNetwork}`);
            const rpcProvider = new JSONRpcProvider({ url: rpcUrl, network: btcNetwork });

            setProvider(rpcProvider);
            setWallet({
                connected: true,
                address: accounts[0] ?? '',
                network: normalisedNetwork,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect wallet.');
        }
    }, []);

    const disconnect = useCallback((): void => {
        setProvider(null);
        setWallet(DISCONNECTED);
    }, []);

    return { wallet, provider, connect, disconnect, error };
}
