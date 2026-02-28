import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount, formatTimestamp, formatPrice, parseTokenAmount, getAuctionStatus } from '@opnosis/shared';
import {
    color, font, card, btnPrimary, btnDisabled, input as inputStyle,
    label as labelStyle, sectionTitle as sectionTitleStyle, statusMsg, dismissBtn, badge as badgeStyle,
} from '../styles.js';
import type { IndexedAuction, IndexedClearing, IndexedOrder } from '../types.js';
import type { useOpnosis } from '../hooks/useOpnosis.js';
import { HelpTip } from './HelpTip.js';

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
        color: color.textSecondary,
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

    /* Expanded detail area */
    detail: {
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: `1px solid ${color.borderSubtle}`,
    } as React.CSSProperties,
    tokenAddr: {
        fontSize: '11px',
        color: color.textSecondary,
        fontFamily: font.body,
        wordBreak: 'break-all' as const,
    } as React.CSSProperties,
    copyIcon: {
        cursor: 'pointer',
        opacity: 0.5,
        flexShrink: 0,
        color: color.textSecondary,
    } as React.CSSProperties,
    section: {
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: `1px solid ${color.borderSubtle}`,
    } as React.CSSProperties,
    inputRow: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '16px',
    } as React.CSSProperties,
    metaGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '16px',
    } as React.CSSProperties,
    metaLabel: {
        ...labelStyle,
        fontSize: '11px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        color: color.textSecondary,
    } as React.CSSProperties,
    metaValue: {
        color: color.textPrimary,
        fontSize: '14px',
        fontFamily: font.body,
        fontWeight: 500,
    } as React.CSSProperties,
    clearingPrice: {
        fontFamily: font.display,
        fontSize: '24px',
        fontWeight: 700,
        color: color.amber,
    } as React.CSSProperties,
};

/**
 * Use backend status as baseline, but advance it forward using client-side time.
 * Blockchain time can be ahead of Date.now(), so we never "downgrade" a status
 * the backend already confirmed (e.g. never turn 'ended' back into 'open').
 */
const STATUS_ORDER = ['upcoming', 'open', 'cancellation_closed', 'ended', 'settled'] as const;
function liveStatus(a: IndexedAuction): string {
    const backendIdx = STATUS_ORDER.indexOf(a.status as typeof STATUS_ORDER[number]);
    const clientStatus = getAuctionStatus(
        BigInt(a.cancellationEndDate),
        BigInt(a.auctionEndDate),
        a.isSettled,
        BigInt(Date.now()),
        BigInt(a.orderPlacementStartDate || '0'),
    );
    const clientIdx = STATUS_ORDER.indexOf(clientStatus as typeof STATUS_ORDER[number]);
    // Return whichever is more advanced
    return clientIdx > backendIdx ? clientStatus : a.status;
}

function statusBadge(status: string, settling?: boolean, failed?: boolean): React.CSSProperties {
    if (failed) return badgeStyle('muted');
    if (settling) return badgeStyle('purple');
    if (status === 'upcoming') return badgeStyle('purple');
    if (status === 'open' || status === 'cancellation_closed') return badgeStyle('amber');
    if (status === 'settled') return badgeStyle('success');
    return badgeStyle('muted');
}

function statusLabel(status: string, settling?: boolean, failed?: boolean): string {
    if (failed) return 'Failed';
    if (settling) return 'Settling...';
    if (status === 'open' || status === 'cancellation_closed') return 'In Progress';
    if (status === 'upcoming') return 'Upcoming';
    if (status === 'settled') return 'Settled';
    if (status === 'ended') return 'Ended';
    return status;
}

interface Props {
    readonly connected: boolean;
    readonly opnosis: ReturnType<typeof useOpnosis>;
    readonly refreshKey?: number;
    readonly pendingAuction?: Partial<IndexedAuction> | null;
    readonly onPendingConfirmed?: () => void;
}

export function AuctionList({ connected, opnosis, refreshKey, pendingAuction, onPendingConfirmed }: Props) {
    const [auctions, setAuctions] = useState<IndexedAuction[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [fetchKey, setFetchKey] = useState(0);

    /* Bid form state */
    const [bidSellAmount, setBidSellAmount] = useState('');
    const [bidMaxUsd, setBidMaxUsd] = useState('');
    const [bidMinReceive, setBidMinReceive] = useState('');
    const [claimOrderIds, setClaimOrderIds] = useState('');
    const [extCancelDays, setExtCancelDays] = useState('0');
    const [extCancelHours, setExtCancelHours] = useState('0');
    const [extCancelMinutes, setExtCancelMinutes] = useState('0');
    const [extAuctionDays, setExtAuctionDays] = useState('0');
    const [extAuctionHours, setExtAuctionHours] = useState('0');
    const [extAuctionMinutes, setExtAuctionMinutes] = useState('0');
    const [biddingTokenUsdPrice, setBiddingTokenUsdPrice] = useState<number | null>(null);
    const [clearing, setClearing] = useState<IndexedClearing | null>(null);
    const [settledIds, setSettledIds] = useState<Set<string>>(new Set());
    const [busyAction, setBusyAction] = useState<string | null>(null); // 'bid', 'settle', 'claim', 'extend'
    const [expandedOrders, setExpandedOrders] = useState<IndexedOrder[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);

    const { txState, resetTx, placeOrders, settleAuction, claimOrders, extendAuction, approveToken, hexAddress, addPendingBid } = opnosis;
    const busy = txState.status === 'pending';

    /* Reset form state when expanded card changes */
    useEffect(() => {
        setBidSellAmount('');
        setBidMaxUsd('');
        setBidMinReceive('');
        setClaimOrderIds('');
        setExtCancelDays('0');
        setExtCancelHours('0');
        setExtCancelMinutes('0');
        setExtAuctionDays('0');
        setExtAuctionHours('0');
        setExtAuctionMinutes('0');
        setBiddingTokenUsdPrice(null);
        setClearing(null);
        setExpandedOrders([]);
        resetTx();
    }, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

    /* Tick every 10s so auction statuses update in real-time */
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 10_000);
        return () => clearInterval(timer);
    }, []);

    /* Fetch auctions */
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
    }, [refreshKey, fetchKey]);

    /* Clear pending auction once the real one appears from backend */
    useEffect(() => {
        if (!pendingAuction || auctions.length === 0) return;
        const match = auctions.some((a) =>
            a.auctioningToken === pendingAuction.auctioningToken
            && a.auctionedSellAmount === pendingAuction.auctionedSellAmount,
        );
        if (match) onPendingConfirmed?.();
    }, [auctions, pendingAuction, onPendingConfirmed]);

    /* Fetch bidding token USD price when expanded */
    useEffect(() => {
        if (!expandedId) return;
        const auction = auctions.find((a) => a.id === expandedId);
        if (!auction?.biddingToken) return;
        let cancelled = false;
        async function loadPrice() {
            try {
                const res = await fetch(`${API_BASE_URL}/price/${auction!.biddingToken}`);
                if (!res.ok) return;
                const data = await res.json() as { usd: number };
                if (!cancelled && data.usd > 0) setBiddingTokenUsdPrice(data.usd);
            } catch {
                // price unavailable
            }
        }
        void loadPrice();
        return () => { cancelled = true; };
    }, [expandedId, auctions]);

    /* Fetch clearing data when expanded auction is settled */
    useEffect(() => {
        if (!expandedId) return;
        const auction = auctions.find((a) => a.id === expandedId);
        if (!auction?.isSettled) {
            setClearing(null);
            return;
        }
        let cancelled = false;
        async function loadClearing() {
            try {
                const res = await fetch(`${API_BASE_URL}/auctions/${expandedId}/clearing`);
                if (!res.ok) return;
                const data = await res.json() as IndexedClearing;
                if (!cancelled) setClearing(data);
            } catch {
                // clearing data unavailable
            }
        }
        void loadClearing();
        return () => { cancelled = true; };
    }, [expandedId, auctions]);


    /* Fetch orders for expanded auction */
    useEffect(() => {
        if (!expandedId) return;
        const auction = auctions.find((a) => a.id === expandedId);
        if (!auction || Number(auction.orderCount) === 0) {
            setExpandedOrders([]);
            return;
        }
        let cancelled = false;
        async function loadOrders() {
            setOrdersLoading(true);
            try {
                const res = await fetch(`${API_BASE_URL}/auctions/${expandedId}/orders`);
                if (!res.ok) return;
                const data = await res.json() as IndexedOrder[];
                if (!cancelled) setExpandedOrders(data);
            } catch {
                // orders unavailable
            } finally {
                if (!cancelled) setOrdersLoading(false);
            }
        }
        void loadOrders();
        const timer = setInterval(() => void loadOrders(), 15_000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [expandedId, auctions]);

    const refresh = () => setFetchKey((k) => k + 1);

    /* Auto-refresh every 15s to pick up settlement confirmations */
    useEffect(() => {
        const timer = setInterval(() => setFetchKey((k) => k + 1), 15_000);
        return () => clearInterval(timer);
    }, []);

    /* Two-way compute: Max USD <-> Min Receive */
    const canCompute = biddingTokenUsdPrice !== null && biddingTokenUsdPrice > 0;

    const onMaxUsdChange = (val: string) => {
        setBidMaxUsd(val);
        if (!canCompute) return;
        const sell = parseFloat(bidSellAmount);
        const maxUsd = parseFloat(val);
        if (sell > 0 && maxUsd > 0) {
            const tokens = (sell * biddingTokenUsdPrice!) / maxUsd;
            setBidMinReceive(tokens.toFixed(8).replace(/\.?0+$/, ''));
        } else {
            setBidMinReceive('');
        }
    };

    const onMinReceiveChange = (val: string) => {
        setBidMinReceive(val);
        if (!canCompute) return;
        const sell = parseFloat(bidSellAmount);
        const minRcv = parseFloat(val);
        if (sell > 0 && minRcv > 0) {
            const maxUsd = (sell * biddingTokenUsdPrice!) / minRcv;
            setBidMaxUsd(maxUsd.toFixed(8).replace(/\.?0+$/, ''));
        } else {
            setBidMaxUsd('');
        }
    };

    const onBidAmountChange = (val: string) => {
        setBidSellAmount(val);
        // Recompute min receive from existing max USD if set
        if (!canCompute) return;
        const sell = parseFloat(val);
        const maxUsd = parseFloat(bidMaxUsd);
        if (sell > 0 && maxUsd > 0) {
            const tokens = (sell * biddingTokenUsdPrice!) / maxUsd;
            setBidMinReceive(tokens.toFixed(8).replace(/\.?0+$/, ''));
        }
    };

    const handleBid = async (auction: IndexedAuction) => {
        const minBuy = bidMinReceive;
        if (!bidSellAmount || !minBuy) return;
        setBusyAction('bid-approving');
        try {
            const approved = await approveToken(auction.biddingToken, parseTokenAmount(bidSellAmount, auction.biddingTokenDecimals));
            if (!approved) return;
            setBusyAction('bid-placing');
            const ok = await placeOrders(
                BigInt(auction.id),
                [parseTokenAmount(minBuy, auction.auctioningTokenDecimals)],
                [parseTokenAmount(bidSellAmount, auction.biddingTokenDecimals)],
            );
            if (ok) {
                addPendingBid(
                    auction.id,
                    parseTokenAmount(bidSellAmount, auction.biddingTokenDecimals).toString(),
                    parseTokenAmount(minBuy, auction.auctioningTokenDecimals).toString(),
                );
                setBidSellAmount('');
                setBidMaxUsd('');
                setBidMinReceive('');
                refresh();
            }
        } finally {
            setBusyAction(null);
        }
    };

    const handleSettle = async (auction: IndexedAuction) => {
        setBusyAction('settle');
        try {
            const ok = await settleAuction(BigInt(auction.id));
            if (ok) {
                setSettledIds((prev) => new Set(prev).add(auction.id));
                refresh();
            }
        } finally {
            setBusyAction(null);
        }
    };

    const handleClaim = async (auction: IndexedAuction) => {
        const ids = claimOrderIds.split(',').map((v) => BigInt(v.trim())).filter((n) => n > 0n);
        if (ids.length === 0) return;
        setBusyAction('claim');
        try {
            const ok = await claimOrders(BigInt(auction.id), ids);
            if (ok) refresh();
        } finally {
            setBusyAction(null);
        }
    };

    const handleExtend = async (auction: IndexedAuction) => {
        const cancelAddMs = (BigInt(parseInt(extCancelDays, 10) || 0) * 86400n + BigInt(parseInt(extCancelHours, 10) || 0) * 3600n + BigInt(parseInt(extCancelMinutes, 10) || 0) * 60n) * 1000n;
        const auctionAddMs = (BigInt(parseInt(extAuctionDays, 10) || 0) * 86400n + BigInt(parseInt(extAuctionHours, 10) || 0) * 3600n + BigInt(parseInt(extAuctionMinutes, 10) || 0) * 60n) * 1000n;
        if (auctionAddMs === 0n) return;
        setBusyAction('extend');
        try {
            const currentCancelEnd = BigInt(auction.cancellationEndDate);
            const currentAuctionEnd = BigInt(auction.auctionEndDate);
            const newCancelEnd = cancelAddMs > 0n ? currentCancelEnd + cancelAddMs : currentCancelEnd;
            const newAuctionEnd = currentAuctionEnd + auctionAddMs;
            const ok = await extendAuction(BigInt(auction.id), newCancelEnd, newAuctionEnd);
            if (ok) refresh();
        } finally {
            setBusyAction(null);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedId((prev) => (prev === id ? null : id));
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void now; // referenced to ensure re-renders when the timer ticks
    const upcoming = auctions.filter((a) => liveStatus(a) === 'upcoming');
    const active = auctions.filter((a) =>
        liveStatus(a) === 'open' || liveStatus(a) === 'cancellation_closed'
        || (settledIds.has(a.id) && !a.isSettled) // keep "Settling..." visible until backend confirms
    );

    if (loading && !pendingAuction) return <div style={s.loading}>Loading auctions...</div>;
    const hasPending = pendingAuction && !auctions.some((a) =>
        a.auctioningToken === pendingAuction.auctioningToken
        && a.auctionedSellAmount === pendingAuction.auctionedSellAmount,
    );
    if (!hasPending && upcoming.length === 0 && active.length === 0) return <div style={s.empty}>No active or upcoming auctions</div>;

    const renderExpandedDetail = (a: IndexedAuction) => {
        const _minFunding = BigInt(a.minFundingThreshold || '0');
        const _totalBid = BigInt(a.totalBidAmount || '0');
        const isFailed = a.fundingNotReached
            || (liveStatus(a) === 'ended' && !a.isSettled && _minFunding > 0n && _totalBid < _minFunding);
        return (
        <div style={s.detail}>
            {/* Token addresses */}
            <div style={s.metaGrid}>
                <div>
                    <div style={s.metaLabel}>{a.auctioningTokenSymbol || 'Auctioning Token'} Contract Address</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={s.tokenAddr}>{a.auctioningToken}</div>
                        <svg
                            style={s.copyIcon}
                            onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(a.auctioningToken); }}
                            xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        ><title>Copy address</title><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </div>
                </div>
                <div>
                    <div style={s.metaLabel}>{a.biddingTokenSymbol || 'Bidding Token'} Contract Address</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={s.tokenAddr}>{a.biddingToken}</div>
                        <svg
                            style={s.copyIcon}
                            onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(a.biddingToken); }}
                            xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        ><title>Copy address</title><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </div>
                </div>
            </div>

            {/* Cancel window — only show when a cancel window was configured */}
            {a.hasCancelWindow && !a.isSettled && (
                <div style={{ marginBottom: '8px' }}>
                    <div style={s.metaLabel}>Cancel Window Ends</div>
                    <div style={s.metaValue}>{formatTimestamp(BigInt(a.cancellationEndDate))}</div>
                </div>
            )}

            {/* Current Bids — auctioneer only */}
            {Number(a.orderCount) > 0 && connected && hexAddress && a.auctioneerAddress && hexAddress.toLowerCase() === a.auctioneerAddress.toLowerCase() && (
                <div style={s.section} onClick={(e) => e.stopPropagation()}>
                    <div style={sectionTitleStyle}>Current Bids ({expandedOrders.filter((o) => !o.cancelled).length})</div>
                    {ordersLoading && expandedOrders.length === 0 ? (
                        <div style={{ color: color.textSecondary, fontFamily: font.body, fontSize: '13px' }}>Loading bids...</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: font.body, fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${color.borderStrong}` }}>
                                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'left', color: color.textSecondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>#</th>
                                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'left', color: color.textSecondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bid Amount</th>
                                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'left', color: color.textSecondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Min Receive</th>
                                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'left', color: color.textSecondary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Address</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expandedOrders.filter((o) => !o.cancelled).map((o) => (
                                        <tr key={o.orderId} style={{ borderBottom: `1px solid ${color.borderSubtle}` }}>
                                            <td style={{ padding: '10px 12px', color: color.textSecondary }}>{o.orderId}</td>
                                            <td style={{ padding: '10px 12px', color: color.textPrimary }}>{formatTokenAmount(BigInt(o.sellAmount), a.biddingTokenDecimals).split('.')[0]} {a.biddingTokenSymbol}</td>
                                            <td style={{ padding: '10px 12px', color: color.textPrimary }}>{formatTokenAmount(BigInt(o.buyAmount), a.auctioningTokenDecimals).split('.')[0]} {a.auctioningTokenSymbol}</td>
                                            <td style={{ padding: '10px 12px', color: color.textSecondary, fontFamily: 'monospace', fontSize: '12px' }}>{o.userAddress.slice(0, 10)}...{o.userAddress.slice(-6)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Extend Auction (auctioneer only, non-settled) */}
            {!a.isSettled && !settledIds.has(a.id) && connected && hexAddress && a.auctioneerAddress && hexAddress.toLowerCase() === a.auctioneerAddress.toLowerCase() && (
                <div style={s.section} onClick={(e) => e.stopPropagation()}>
                    <div style={sectionTitleStyle}>Extend Auction</div>
                    <div style={s.inputRow}>
                        <div>
                            <label style={labelStyle}>Extend Cancel Window By</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input style={{ ...inputStyle, width: '56px', textAlign: 'center' }} type="number" min="0" value={extCancelDays} onChange={(e) => setExtCancelDays(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!extCancelDays) setExtCancelDays('0'); }} />
                                <span style={{ fontFamily: font.body, fontSize: '14px', color: color.textSecondary }}>days</span>
                                <input style={{ ...inputStyle, width: '56px', textAlign: 'center' }} type="number" min="0" max="23" value={extCancelHours} onChange={(e) => setExtCancelHours(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!extCancelHours) setExtCancelHours('0'); }} />
                                <span style={{ fontFamily: font.body, fontSize: '14px', color: color.textSecondary }}>hours</span>
                                <input style={{ ...inputStyle, width: '56px', textAlign: 'center' }} type="number" min="0" max="59" value={extCancelMinutes} onChange={(e) => setExtCancelMinutes(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!extCancelMinutes) setExtCancelMinutes('0'); }} />
                                <span style={{ fontFamily: font.body, fontSize: '14px', color: color.textSecondary }}>min</span>
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Extend Auction End By</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input style={{ ...inputStyle, width: '56px', textAlign: 'center' }} type="number" min="0" value={extAuctionDays} onChange={(e) => setExtAuctionDays(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!extAuctionDays) setExtAuctionDays('0'); }} />
                                <span style={{ fontFamily: font.body, fontSize: '14px', color: color.textSecondary }}>days</span>
                                <input style={{ ...inputStyle, width: '56px', textAlign: 'center' }} type="number" min="0" max="23" value={extAuctionHours} onChange={(e) => setExtAuctionHours(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!extAuctionHours) setExtAuctionHours('0'); }} />
                                <span style={{ fontFamily: font.body, fontSize: '14px', color: color.textSecondary }}>hours</span>
                                <input style={{ ...inputStyle, width: '56px', textAlign: 'center' }} type="number" min="0" max="59" value={extAuctionMinutes} onChange={(e) => setExtAuctionMinutes(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!extAuctionMinutes) setExtAuctionMinutes('0'); }} />
                                <span style={{ fontFamily: font.body, fontSize: '14px', color: color.textSecondary }}>min</span>
                            </div>
                        </div>
                    </div>
                    <button
                        className="glow-amber"
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={(e) => { e.stopPropagation(); void handleExtend(a); }}
                    >{busyAction === 'extend' ? 'Processing...' : 'Extend'}</button>
                </div>
            )}

            {/* Settlement Results */}
            {isFailed && (
                <div style={s.section}>
                    <div style={sectionTitleStyle}>Settlement Results</div>
                    <div style={{ color: color.textMuted, fontFamily: font.body, fontSize: '15px' }}>
                        Min Funding Not Met — all bids are refundable. No protocol fee is charged for failed auctions; the full deposit (including fee) is returned to the auctioneer.
                    </div>
                </div>
            )}
            {a.isSettled && !isFailed && clearing && (() => {
                // Human price = (sell / 10^biddingDec) / (buy / 10^auctioningDec)
                const sellHuman = Number(BigInt(clearing.clearingSellAmount)) / (10 ** a.biddingTokenDecimals);
                const buyHuman = Number(BigInt(clearing.clearingBuyAmount)) / (10 ** a.auctioningTokenDecimals);
                const tokenRatio = buyHuman > 0 ? sellHuman / buyHuman : 0;
                const usdPerToken = biddingTokenUsdPrice !== null && tokenRatio > 0 ? tokenRatio * biddingTokenUsdPrice : null;
                return (
                    <div style={s.section}>
                        <div style={sectionTitleStyle}>Settlement Results</div>
                        <div style={s.metaGrid}>
                            <div>
                                <div style={s.metaLabel}>Clearing Price (USD)</div>
                                <div style={s.clearingPrice}>{usdPerToken !== null ? `$${usdPerToken.toFixed(2)}` : '--'}</div>
                            </div>
                            <div>
                                <div style={s.metaLabel}>Clearing Price ({a.biddingTokenSymbol})</div>
                                <div style={s.metaValue}>{formatPrice(BigInt(clearing.clearingSellAmount), BigInt(clearing.clearingBuyAmount), a.biddingTokenDecimals, a.auctioningTokenDecimals)}</div>
                            </div>
                            <div>
                                <div style={s.metaLabel}>Total Distributed</div>
                                <div style={s.metaValue}>{formatTokenAmount(BigInt(clearing.clearingBuyAmount), a.auctioningTokenDecimals).split('.')[0]} {a.auctioningTokenSymbol}</div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Upcoming notice */}
            {liveStatus(a) === 'upcoming' && (
                <div style={s.section}>
                    <div style={sectionTitleStyle}>Bidding Not Yet Open</div>
                    <div style={{ color: color.textSecondary, fontFamily: font.body, fontSize: '15px' }}>
                        Bidding starts {formatTimestamp(BigInt(a.orderPlacementStartDate))}. Check back then to place your bid.
                    </div>
                </div>
            )}

            {/* Place Bid — hide when settling */}
            {(liveStatus(a) === 'open' || liveStatus(a) === 'cancellation_closed') && !settledIds.has(a.id) && (
                <div style={s.section}>
                    <div style={sectionTitleStyle}>Place Bid</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={labelStyle}>Bid Amount ({a.biddingTokenSymbol})<HelpTip text={`The amount of ${a.biddingTokenSymbol || 'bidding tokens'} you want to spend. This is locked in until the auction settles or you cancel during the cancel window.`} /></label>
                            <input style={inputStyle} value={bidSellAmount} onChange={(e) => onBidAmountChange(e.target.value)} placeholder="0" onClick={(e) => e.stopPropagation()} />
                        </div>
                        <div>
                            <label style={labelStyle}>Max USD per {a.auctioningTokenSymbol}<HelpTip text={`The maximum price in USD you are willing to pay per ${a.auctioningTokenSymbol || 'token'}. This auto-calculates Min Receive based on the current ${a.biddingTokenSymbol || 'bidding token'} price. You only need to fill in one of Max USD or Min Receive.`} /></label>
                            <input style={inputStyle} value={bidMaxUsd} onChange={(e) => onMaxUsdChange(e.target.value)} placeholder="0" onClick={(e) => e.stopPropagation()} />
                        </div>
                        <div>
                            <label style={labelStyle}>Min Receive ({a.auctioningTokenSymbol})<HelpTip text={`The minimum number of ${a.auctioningTokenSymbol || 'auction tokens'} you want to receive for your bid. If the clearing price is above your max, your bid won't win and you'll be refunded automatically.`} /></label>
                            <input style={inputStyle} value={bidMinReceive} onChange={(e) => onMinReceiveChange(e.target.value)} placeholder="0" onClick={(e) => e.stopPropagation()} />
                        </div>
                    </div>
                    {biddingTokenUsdPrice === null && (
                        <div style={{ color: color.textMuted, fontSize: '12px', fontFamily: font.body, marginBottom: '12px' }}>
                            USD price unavailable for {a.biddingTokenSymbol} — min receive cannot be computed.
                        </div>
                    )}
                    <button
                        className="glow-amber"
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={(e) => { e.stopPropagation(); void handleBid(a); }}
                    >{busyAction === 'bid-approving' ? 'Approving...' : busyAction === 'bid-placing' ? 'Placing Bid...' : 'Place Bid'}</button>
                </div>
            )}

            {/* Settle — anyone after auction ends, or auctioneer via atomic closure while open (only if min funding met) */}
            {!settledIds.has(a.id) && (liveStatus(a) === 'ended' || (a.isAtomicClosureAllowed && !a.isSettled && liveStatus(a) !== 'upcoming' && hexAddress && a.auctioneerAddress && hexAddress.toLowerCase() === a.auctioneerAddress.toLowerCase())) && (() => {
                const isAtomicClosure = liveStatus(a) !== 'ended';
                const totalBid = BigInt(a.totalBidAmount || '0');
                const minFunding = BigInt(a.minFundingThreshold || '0');
                const fundingMet = minFunding === 0n || totalBid >= minFunding;
                const atomicDisabled = isAtomicClosure && !fundingMet;
                return (
                    <div style={s.section}>
                        <div style={sectionTitleStyle}>{isAtomicClosure ? 'Atomic Closure' : 'Settlement'}</div>
                        <button
                            className="glow-amber"
                            style={{ ...btnPrimary, ...((busy || !connected || atomicDisabled) ? btnDisabled : {}) }}
                            disabled={busy || !connected || atomicDisabled}
                            onClick={(e) => { e.stopPropagation(); void handleSettle(a); }}
                        >{busyAction === 'settle' ? 'Settling...' : isAtomicClosure ? 'Settle Now' : 'Settle Auction'}</button>
                        {atomicDisabled && (
                            <div style={{ fontSize: '12px', color: color.textMuted, marginTop: '8px' }}>
                                Min funding threshold not yet met ({formatTokenAmount(totalBid, a.biddingTokenDecimals)} / {formatTokenAmount(minFunding, a.biddingTokenDecimals)} {a.biddingTokenSymbol})
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Manual Claim (fallback) */}
            {a.isSettled && connected && (
                <div style={s.section}>
                    <div style={{ ...sectionTitleStyle, fontSize: '14px' }}>Manual Claim</div>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Order IDs (comma-separated)</label>
                        <input
                            style={inputStyle}
                            value={claimOrderIds}
                            onChange={(e) => setClaimOrderIds(e.target.value)}
                            placeholder="0, 1, 2"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <button
                        className="glow-amber"
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={(e) => { e.stopPropagation(); void handleClaim(a); }}
                    >{busyAction === 'claim' ? 'Claiming...' : 'Claim'}</button>
                </div>
            )}

            {/* Tx status */}
            {txState.status !== 'idle' && (
                <div style={statusMsg(txState.status === 'error')}>
                    {txState.message}
                    {(txState.status === 'success' || txState.status === 'error') && (
                        <button style={dismissBtn} onClick={(e) => { e.stopPropagation(); resetTx(); }}>dismiss</button>
                    )}
                </div>
            )}
        </div>
    );
    };

    const renderCard = (a: IndexedAuction) => {
        const isHovered = hoveredId === a.id;
        const isExpanded = expandedId === a.id;
        const status = liveStatus(a);
        const isUpcoming = status === 'upcoming';
        const isSettling = settledIds.has(a.id) && !a.isSettled;
        const minFunding = BigInt(a.minFundingThreshold || '0');
        const totalBid = BigInt(a.totalBidAmount || '0');
        const isFailed = a.fundingNotReached
            || (status === 'ended' && !a.isSettled && minFunding > 0n && totalBid < minFunding);
        return (
            <div
                key={a.id}
                style={{
                    ...s.card,
                    ...(isExpanded ? { gridColumn: '1 / -1' } : {}),
                    ...(isHovered && !isExpanded ? {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 0 20px rgba(155, 77, 187, 0.4), 0 0 40px rgba(155, 77, 187, 0.2), inset 0 0 30px rgba(155, 77, 187, 0.1)',
                        border: '1px solid rgba(181, 104, 212, 0.7)',
                        background: 'rgba(155, 77, 187, 0.06)',
                    } : {}),
                }}
                onClick={() => toggleExpand(a.id)}
                onMouseEnter={() => setHoveredId(a.id)}
                onMouseLeave={() => setHoveredId(null)}
            >
                <div style={s.cardHeader}>
                    <span style={s.cardTitle}>{a.auctioningTokenName || `Auction #${a.id}`}</span>
                    <span style={statusBadge(status, isSettling, isFailed)}>{statusLabel(status, isSettling, isFailed)}</span>
                </div>
                <div style={s.label}>Total Auction Tokens</div>
                <div style={s.value}>{formatTokenAmount(BigInt(a.auctionedSellAmount), a.auctioningTokenDecimals)} {a.auctioningTokenSymbol}</div>
                <div style={s.label}>Min Funding Threshold</div>
                <div style={s.value}>{formatTokenAmount(BigInt(a.minFundingThreshold), a.biddingTokenDecimals)} {a.biddingTokenSymbol}</div>
                <div style={s.label}>Auction Ending</div>
                <div style={s.value}>{formatTimestamp(BigInt(a.auctionEndDate))}</div>
                {isUpcoming ? (
                    <>
                        <div style={s.label}>Bidding Starts</div>
                        <div style={s.value}>{formatTimestamp(BigInt(a.orderPlacementStartDate))}</div>
                    </>
                ) : (
                    <>
                        <div style={s.label}>Total Bid Amount</div>
                        <div style={s.value}>{formatTokenAmount(BigInt(a.totalBidAmount || '0'), a.biddingTokenDecimals)} {a.biddingTokenSymbol}</div>
                    </>
                )}

                {isExpanded && renderExpandedDetail(a)}
            </div>
        );
    };

    return (
        <>
            <div style={{ ...sectionTitleStyle, marginBottom: '16px' }}>Open Auctions</div>
            {hasPending && (
                <div style={{ ...s.grid, marginBottom: '32px' }}>
                    <div style={{ ...s.card, opacity: 0.7 }}>
                        <div style={s.cardHeader}>
                            <span style={s.cardTitle}>{pendingAuction.auctioningTokenName || pendingAuction.auctioningTokenSymbol || 'New Auction'}</span>
                            <span style={badgeStyle('pending')}>Pending</span>
                        </div>
                        <div style={s.label}>Total Auction Tokens</div>
                        <div style={s.value}>{pendingAuction.auctionedSellAmount && pendingAuction.auctioningTokenDecimals != null
                            ? `${formatTokenAmount(BigInt(pendingAuction.auctionedSellAmount), pendingAuction.auctioningTokenDecimals)} ${pendingAuction.auctioningTokenSymbol || ''}`
                            : '--'}</div>
                        <div style={{ color: color.textMuted, fontSize: '12px', fontFamily: font.body, marginTop: '12px' }}>
                            Waiting for on-chain confirmation...
                        </div>
                    </div>
                </div>
            )}
            {upcoming.length > 0 && (
                <>
                    <div style={{ ...sectionTitleStyle, marginBottom: '16px', fontSize: '16px' }}>Upcoming</div>
                    <div style={{ ...s.grid, marginBottom: '32px' }}>{upcoming.map(renderCard)}</div>
                </>
            )}
            {active.length > 0 && (
                <div style={s.grid}>{active.map(renderCard)}</div>
            )}
        </>
    );
}
