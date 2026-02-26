import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount, formatPrice } from '@opnosis/shared';
import { color, font, card, badge as badgeStyle } from '../styles.js';
import type { IndexedAuction, IndexedClearing } from '../types.js';

const s = {
    grid: {
        display: 'grid',
        gap: '16px',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    } as React.CSSProperties,
    card: {
        ...card,
    } as React.CSSProperties,
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
    } as React.CSSProperties,
    cardTitle: {
        fontFamily: font.display,
        fontWeight: 700,
        fontSize: '16px',
        color: color.textPrimary,
    } as React.CSSProperties,
    priceLabel: {
        color: color.textMuted,
        fontSize: '11px',
        fontFamily: font.body,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        marginTop: '4px',
    } as React.CSSProperties,
    priceValue: {
        fontFamily: font.display,
        fontSize: '24px',
        fontWeight: 700,
        color: color.amber,
        lineHeight: 1.2,
        marginBottom: '12px',
    } as React.CSSProperties,
    row: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
    } as React.CSSProperties,
    label: {
        color: color.textMuted,
        fontSize: '12px',
        fontFamily: font.body,
    } as React.CSSProperties,
    value: {
        color: color.textSecondary,
        fontSize: '14px',
        fontFamily: font.body,
        fontWeight: 500,
        textAlign: 'right' as const,
    } as React.CSSProperties,
    empty: {
        color: color.textMuted,
        textAlign: 'center' as const,
        padding: '48px 24px',
        fontFamily: font.body,
        fontSize: '15px',
    } as React.CSSProperties,
    loading: {
        color: color.textSecondary,
        textAlign: 'center' as const,
        padding: '48px 24px',
        fontFamily: font.body,
    } as React.CSSProperties,
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

    if (loading) return <div style={s.loading}>Loading results...</div>;
    if (results.length === 0) return <div style={s.empty}>No settled auctions yet</div>;

    return (
        <div style={s.grid}>
            {results.map(({ auction, clearing }) => {
                const clearingPrice = clearing
                    ? formatPrice(BigInt(clearing.clearingSellAmount), BigInt(clearing.clearingBuyAmount))
                    : '--';
                const volumeRaised = clearing
                    ? formatTokenAmount(BigInt(clearing.clearingSellAmount))
                    : '--';

                return (
                    <div key={auction.id} style={s.card}>
                        <div style={s.cardHeader}>
                            <span style={s.cardTitle}>Auction #{auction.id}</span>
                            <span style={badgeStyle('success')}>Settled</span>
                        </div>
                        <div style={s.priceLabel}>Clearing Price</div>
                        <div style={s.priceValue}>{clearingPrice}</div>
                        <div style={s.row}>
                            <span style={s.label}>Volume Raised</span>
                            <span style={s.value}>{volumeRaised}</span>
                        </div>
                        <div style={s.row}>
                            <span style={s.label}>Orders Filled</span>
                            <span style={s.value}>{auction.orderCount} / 100</span>
                        </div>
                        <div style={s.row}>
                            <span style={s.label}>Sell Amount</span>
                            <span style={s.value}>{formatTokenAmount(BigInt(auction.auctionedSellAmount))}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
