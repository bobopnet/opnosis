import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount } from '@opnosis/shared';
import type { IndexedAuction } from '../types.js';

const styles = {
    grid: { display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' } as const,
    card: {
        background: '#1e1e2e', borderRadius: '12px', padding: '20px',
        border: '1px solid #2d2d3f', cursor: 'pointer', transition: 'border-color 0.2s',
    } as const,
    badge: (status: string) => ({
        display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
        background: status === 'open' ? '#065f46' : status === 'settled' ? '#6366f1' : '#92400e',
        color: '#fff',
    }) as const,
    label: { color: '#9ca3af', fontSize: '12px', marginTop: '8px' } as const,
    value: { color: '#e2e8f0', fontSize: '14px' } as const,
    empty: { color: '#6b7280', textAlign: 'center' as const, padding: '40px' },
    loading: { color: '#9ca3af', textAlign: 'center' as const, padding: '40px' },
};

interface Props {
    readonly onSelect: (id: string) => void;
    readonly refreshKey?: number;
}

export function AuctionList({ onSelect, refreshKey }: Props) {
    const [auctions, setAuctions] = useState<IndexedAuction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch(`${API_BASE_URL}/auctions`);
                if (!res.ok) throw new Error('Failed to fetch');
                const data: IndexedAuction[] = await res.json() as IndexedAuction[];
                if (!cancelled) setAuctions(data);
            } catch {
                if (!cancelled) setAuctions([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [refreshKey]);

    if (loading) return <div style={styles.loading}>Loading auctions...</div>;
    if (auctions.length === 0) return <div style={styles.empty}>No auctions found</div>;

    return (
        <div style={styles.grid}>
            {auctions.map((a) => (
                <div key={a.id} style={styles.card} onClick={() => onSelect(a.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#fff' }}>Auction #{a.id}</span>
                        <span style={styles.badge(a.status)}>{a.status}</span>
                    </div>
                    <div style={styles.label}>Sell Amount</div>
                    <div style={styles.value}>{formatTokenAmount(BigInt(a.auctionedSellAmount))}</div>
                    <div style={styles.label}>Min Buy Amount</div>
                    <div style={styles.value}>{formatTokenAmount(BigInt(a.minBuyAmount))}</div>
                    <div style={styles.label}>Orders</div>
                    <div style={styles.value}>{a.orderCount} / 100</div>
                </div>
            ))}
        </div>
    );
}
