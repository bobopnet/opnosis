import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount, formatTimestamp } from '@opnosis/shared';
import { color, font, card, badge as badgeStyle, sectionTitle as sectionTitleStyle } from '../styles.js';
import type { IndexedAuction } from '../types.js';

const s = {
    grid: {
        display: 'grid',
        gap: '16px',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    } as React.CSSProperties,
    card: {
        ...card,
        cursor: 'pointer',
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
    label: {
        color: color.textMuted,
        fontSize: '11px',
        fontFamily: font.body,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        marginTop: '10px',
    } as React.CSSProperties,
    value: {
        color: color.textPrimary,
        fontSize: '14px',
        fontFamily: font.body,
        fontWeight: 500,
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

function statusBadge(status: string): React.CSSProperties {
    if (status === 'upcoming') return badgeStyle('purple');
    if (status === 'open') return badgeStyle('amber');
    if (status === 'settled') return badgeStyle('success');
    return badgeStyle('muted');
}

interface Props {
    readonly onSelect: (id: string) => void;
    readonly refreshKey?: number;
}

export function AuctionList({ onSelect, refreshKey }: Props) {
    const [auctions, setAuctions] = useState<IndexedAuction[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

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

    if (loading) return <div style={s.loading}>Loading auctions...</div>;
    if (auctions.length === 0) return <div style={s.empty}>No auctions found</div>;

    const upcoming = auctions.filter((a) => a.status === 'upcoming');
    const rest = auctions.filter((a) => a.status !== 'upcoming');

    const renderCard = (a: IndexedAuction) => {
        const isHovered = hoveredId === a.id;
        const isUpcoming = a.status === 'upcoming';
        return (
            <div
                key={a.id}
                style={{
                    ...s.card,
                    ...(isHovered ? {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 24px rgba(232, 148, 26, 0.12)',
                    } : {}),
                }}
                onClick={() => onSelect(a.id)}
                onMouseEnter={() => setHoveredId(a.id)}
                onMouseLeave={() => setHoveredId(null)}
            >
                <div style={s.cardHeader}>
                    <span style={s.cardTitle}>Auction #{a.id}</span>
                    <span style={statusBadge(a.status)}>{a.status}</span>
                </div>
                <div style={s.label}>Sell Amount</div>
                <div style={s.value}>{formatTokenAmount(BigInt(a.auctionedSellAmount))}</div>
                <div style={s.label}>Min Buy Amount</div>
                <div style={s.value}>{formatTokenAmount(BigInt(a.minBuyAmount))}</div>
                {isUpcoming ? (
                    <>
                        <div style={s.label}>Bidding Starts</div>
                        <div style={s.value}>{formatTimestamp(BigInt(a.orderPlacementStartDate))}</div>
                    </>
                ) : (
                    <>
                        <div style={s.label}>Orders</div>
                        <div style={s.value}>{a.orderCount} / 100</div>
                    </>
                )}
            </div>
        );
    };

    return (
        <>
            {upcoming.length > 0 && (
                <>
                    <div style={{ ...sectionTitleStyle, marginBottom: '16px' }}>Upcoming Auctions</div>
                    <div style={{ ...s.grid, marginBottom: '32px' }}>{upcoming.map(renderCard)}</div>
                </>
            )}
            {rest.length > 0 && (
                <>
                    {upcoming.length > 0 && <div style={{ ...sectionTitleStyle, marginBottom: '16px' }}>Active Auctions</div>}
                    <div style={s.grid}>{rest.map(renderCard)}</div>
                </>
            )}
        </>
    );
}
