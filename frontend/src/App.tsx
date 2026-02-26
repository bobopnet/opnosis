import { useState, useEffect } from 'react';
import { useWallet } from './hooks/useWallet.js';
import { useOpnosis } from './hooks/useOpnosis.js';
import { AuctionList } from './components/AuctionList.js';
import { ResultsList } from './components/ResultsList.js';
import { CreateAuction } from './components/CreateAuction.js';
import { AuctionDetail } from './components/AuctionDetail.js';
import { API_BASE_URL } from './constants.js';
import { formatTokenAmount } from '@opnosis/shared';
import type { AuctionStats } from './types.js';

type Tab = 'browse' | 'results' | 'create' | 'detail';

const styles = {
    container: { maxWidth: '960px', margin: '0 auto', padding: '24px' } as const,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' } as const,
    title: { fontSize: '24px', fontWeight: 700, color: '#fff' } as const,
    connectBtn: {
        padding: '10px 20px', borderRadius: '8px', border: 'none',
        background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
    } as const,
    disconnectBtn: {
        padding: '10px 20px', borderRadius: '8px', border: '1px solid #374151',
        background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '14px',
    } as const,
    tabs: { display: 'flex', gap: '8px', marginBottom: '24px' } as const,
    tab: (active: boolean) => ({
        padding: '8px 16px', borderRadius: '6px', border: 'none',
        background: active ? '#6366f1' : '#1e1e2e', color: active ? '#fff' : '#9ca3af',
        cursor: 'pointer', fontSize: '14px', fontWeight: 500,
    }) as const,
    error: { color: '#ef4444', marginBottom: '12px', fontSize: '14px' } as const,
    walletInfo: { fontSize: '12px', color: '#9ca3af' } as const,
    statsBanner: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' as const } as const,
    statCard: {
        background: '#1e1e2e', borderRadius: '8px', padding: '12px 16px',
        border: '1px solid #2d2d3f', flex: '1', minWidth: '120px',
    } as const,
    statValue: { fontSize: '20px', fontWeight: 700, color: '#6366f1' } as const,
    statLabel: { fontSize: '11px', color: '#9ca3af', marginTop: '2px' } as const,
    footer: {
        marginTop: '48px', paddingTop: '16px', borderTop: '1px solid #2d2d3f',
        display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px',
    } as const,
    footerLink: { color: '#6b7280', textDecoration: 'none' } as const,
};

export function App() {
    const { wallet, provider, connect, disconnect, error: walletError } = useWallet();
    const opnosis = useOpnosis(provider, wallet.network);
    const [tab, setTab] = useState<Tab>('browse');
    const [selectedAuctionId, setSelectedAuctionId] = useState<string>('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [stats, setStats] = useState<AuctionStats | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function loadStats() {
            try {
                const res = await fetch(`${API_BASE_URL}/stats`);
                if (!res.ok) return;
                const data = await res.json() as AuctionStats;
                if (!cancelled) setStats(data);
            } catch {
                // stats unavailable
            }
        }
        void loadStats();
        return () => { cancelled = true; };
    }, [refreshKey]);

    const viewAuction = (id: string) => {
        setSelectedAuctionId(id);
        setTab('detail');
    };

    const onCreated = () => setRefreshKey((k) => k + 1);

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div>
                    <div style={styles.title}>Opnosis</div>
                    <div style={{ color: '#6366f1', fontSize: '12px' }}>Batch Auctions on Bitcoin</div>
                </div>
                <div>
                    {wallet.connected ? (
                        <div style={{ textAlign: 'right' }}>
                            <div style={styles.walletInfo}>
                                {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)} ({wallet.network})
                            </div>
                            <button style={styles.disconnectBtn} onClick={disconnect}>Disconnect</button>
                        </div>
                    ) : (
                        <button style={styles.connectBtn} onClick={() => void connect()}>
                            Connect OP_WALLET
                        </button>
                    )}
                </div>
            </div>

            {walletError && <div style={styles.error}>{walletError}</div>}

            {stats && (
                <div style={styles.statsBanner}>
                    <div style={styles.statCard}>
                        <div style={styles.statValue}>{stats.totalAuctions}</div>
                        <div style={styles.statLabel}>Auctions</div>
                    </div>
                    <div style={styles.statCard}>
                        <div style={styles.statValue}>{stats.settledAuctions}</div>
                        <div style={styles.statLabel}>Settled</div>
                    </div>
                    <div style={styles.statCard}>
                        <div style={styles.statValue}>{stats.openAuctions}</div>
                        <div style={styles.statLabel}>Open</div>
                    </div>
                    <div style={styles.statCard}>
                        <div style={styles.statValue}>{formatTokenAmount(BigInt(stats.totalVolume))}</div>
                        <div style={styles.statLabel}>Total Volume</div>
                    </div>
                </div>
            )}

            <div style={styles.tabs}>
                <button style={styles.tab(tab === 'browse')} onClick={() => setTab('browse')}>Browse</button>
                <button style={styles.tab(tab === 'results')} onClick={() => setTab('results')}>Results</button>
                <button style={styles.tab(tab === 'create')} onClick={() => setTab('create')}>Create</button>
            </div>

            {tab === 'browse' && <AuctionList onSelect={viewAuction} refreshKey={refreshKey} />}
            {tab === 'results' && <ResultsList />}
            {tab === 'create' && (
                <CreateAuction
                    connected={wallet.connected}
                    opnosis={opnosis}
                    onCreated={onCreated}
                />
            )}
            {tab === 'detail' && (
                <AuctionDetail
                    auctionId={selectedAuctionId}
                    connected={wallet.connected}
                    opnosis={opnosis}
                    onBack={() => setTab('browse')}
                />
            )}
            <footer style={styles.footer}>
                <a href="/TERMS_OF_SERVICE.md" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>Terms of Service</a>
                <span style={{ color: '#374151' }}>|</span>
                <a href="/PRIVACY_POLICY.md" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>Privacy Policy</a>
            </footer>
        </div>
    );
}
