import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount, formatPrice } from '@opnosis/shared';
import type { IndexedAuction, IndexedClearing } from '../types.js';

const styles = {
    grid: { display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' } as const,
    card: {
        background: '#1e1e2e', borderRadius: '12px', padding: '20px',
        border: '1px solid #2d2d3f',
    } as const,
    cardTitle: { fontWeight: 600, color: '#fff', marginBottom: '12px', fontSize: '16px' } as const,
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } as const,
    label: { color: '#9ca3af', fontSize: '12px' } as const,
    value: { color: '#e2e8f0', fontSize: '14px', textAlign: 'right' as const } as const,
    badge: {
        display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
        background: '#6366f1', color: '#fff',
    } as const,
    empty: { color: '#6b7280', textAlign: 'center' as const, padding: '40px' },
    loading: { color: '#9ca3af', textAlign: 'center' as const, padding: '40px' },
};

interface AuctionWithClearing {
    auction: IndexedAuction;
    clearing: IndexedClearing | null;
}

export function ResultsList() {
    const [results, setResults] = useState<AuctionWithClearing[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch(`${API_BASE_URL}/auctions`);
                if (!res.ok) throw new Error('Failed to fetch');
                const auctions = await res.json() as IndexedAuction[];
                const settled = auctions.filter((a) => a.isSettled);

                const withClearing: AuctionWithClearing[] = await Promise.all(
                    settled.map(async (auction) => {
                        try {
                            const cRes = await fetch(`${API_BASE_URL}/auctions/${auction.id}/clearing`);
                            if (!cRes.ok) return { auction, clearing: null };
                            const clearing = await cRes.json() as IndexedClearing;
                            return { auction, clearing };
                        } catch {
                            return { auction, clearing: null };
                        }
                    }),
                );

                if (!cancelled) setResults(withClearing);
            } catch {
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, []);

    if (loading) return <div style={styles.loading}>Loading results...</div>;
    if (results.length === 0) return <div style={styles.empty}>No settled auctions yet</div>;

    return (
        <div style={styles.grid}>
            {results.map(({ auction, clearing }) => {
                const clearingPrice = clearing
                    ? formatPrice(BigInt(clearing.clearingSellAmount), BigInt(clearing.clearingBuyAmount))
                    : '--';
                const volumeRaised = clearing
                    ? formatTokenAmount(BigInt(clearing.clearingSellAmount))
                    : '--';

                return (
                    <div key={auction.id} style={styles.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={styles.cardTitle}>Auction #{auction.id}</span>
                            <span style={styles.badge}>Settled</span>
                        </div>
                        <div style={styles.row}>
                            <span style={styles.label}>Clearing Price</span>
                            <span style={styles.value}>{clearingPrice}</span>
                        </div>
                        <div style={styles.row}>
                            <span style={styles.label}>Volume Raised</span>
                            <span style={styles.value}>{volumeRaised}</span>
                        </div>
                        <div style={styles.row}>
                            <span style={styles.label}>Orders Filled</span>
                            <span style={styles.value}>{auction.orderCount} / 100</span>
                        </div>
                        <div style={styles.row}>
                            <span style={styles.label}>Sell Amount</span>
                            <span style={styles.value}>{formatTokenAmount(BigInt(auction.auctionedSellAmount))}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
