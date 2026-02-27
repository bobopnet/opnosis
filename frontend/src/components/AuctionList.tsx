import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount, formatTimestamp, formatPrice, parseTokenAmount } from '@opnosis/shared';
import {
    color, font, card, btnPrimary, btnSecondary, btnDisabled, input as inputStyle,
    label as labelStyle, sectionTitle as sectionTitleStyle, statusMsg, dismissBtn, badge as badgeStyle,
} from '../styles.js';
import type { IndexedAuction, IndexedClearing, IndexedOrder } from '../types.js';
import type { useOpnosis } from '../hooks/useOpnosis.js';

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

function statusBadge(status: string): React.CSSProperties {
    if (status === 'upcoming') return badgeStyle('purple');
    if (status === 'open' || status === 'cancellation_closed') return badgeStyle('amber');
    if (status === 'settled') return badgeStyle('success');
    return badgeStyle('muted');
}

function statusLabel(status: string): string {
    if (status === 'open' || status === 'cancellation_closed') return 'In Progress';
    if (status === 'upcoming') return 'Upcoming';
    if (status === 'settled') return 'Settled';
    if (status === 'ended') return 'Ended';
    return status;
}

interface Props {
    readonly connected: boolean;
    readonly walletAddress: string;
    readonly opnosis: ReturnType<typeof useOpnosis>;
    readonly refreshKey?: number;
}

export function AuctionList({ connected, walletAddress, opnosis, refreshKey }: Props) {
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
    const [extendCancelEnd, setExtendCancelEnd] = useState('');
    const [extendAuctionEnd, setExtendAuctionEnd] = useState('');
    const [biddingTokenUsdPrice, setBiddingTokenUsdPrice] = useState<number | null>(null);
    const [clearing, setClearing] = useState<IndexedClearing | null>(null);
    const [myOrders, setMyOrders] = useState<IndexedOrder[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);

    const { txState, resetTx, placeOrders, cancelOrders, settleAuction, claimOrders, extendAuction, approveToken } = opnosis;
    const busy = txState.status === 'pending';

    /* Reset form state when expanded card changes */
    useEffect(() => {
        setBidSellAmount('');
        setBidMaxUsd('');
        setBidMinReceive('');
        setClaimOrderIds('');
        setExtendCancelEnd('');
        setExtendAuctionEnd('');
        setBiddingTokenUsdPrice(null);
        setClearing(null);
        setMyOrders([]);
        resetTx();
    }, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

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

    /* Fetch orders for the expanded auction when wallet is connected */
    useEffect(() => {
        if (!expandedId || !connected) {
            setMyOrders([]);
            return;
        }
        let cancelled = false;
        setOrdersLoading(true);
        async function loadOrders() {
            try {
                const res = await fetch(`${API_BASE_URL}/auctions/${expandedId}/orders`);
                if (!res.ok) return;
                const data = await res.json() as IndexedOrder[];
                if (!cancelled) {
                    const mine = data.filter((o) => o.userAddress.toLowerCase() === walletAddress.toLowerCase());
                    setMyOrders(mine);
                }
            } catch {
                // orders unavailable
            } finally {
                if (!cancelled) setOrdersLoading(false);
            }
        }
        void loadOrders();
        return () => { cancelled = true; };
    }, [expandedId, connected, walletAddress, fetchKey]);

    const refresh = () => setFetchKey((k) => k + 1);

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
        const approved = await approveToken(auction.biddingToken, parseTokenAmount(bidSellAmount));
        if (!approved) return;
        const ok = await placeOrders(
            BigInt(auction.id),
            [parseTokenAmount(minBuy)],
            [parseTokenAmount(bidSellAmount)],
        );
        if (ok) refresh();
    };

    const handleSettle = async (auction: IndexedAuction) => {
        const ok = await settleAuction(BigInt(auction.id));
        if (ok) refresh();
    };

    const handleClaim = async (auction: IndexedAuction) => {
        const ids = claimOrderIds.split(',').map((v) => BigInt(v.trim())).filter((n) => n > 0n);
        if (ids.length === 0) return;
        const ok = await claimOrders(BigInt(auction.id), ids);
        if (ok) refresh();
    };

    const handleCancelOrder = async (auction: IndexedAuction, orderId: number) => {
        const ok = await cancelOrders(BigInt(auction.id), [BigInt(orderId)]);
        if (ok) refresh();
    };

    const handleClaimOrder = async (auction: IndexedAuction, orderId: number) => {
        const ok = await claimOrders(BigInt(auction.id), [BigInt(orderId)]);
        if (ok) refresh();
    };

    const handleClaimMyOrders = async (auction: IndexedAuction) => {
        const claimable = myOrders.filter((o) => !o.cancelled && !o.claimed);
        if (claimable.length === 0) return;
        const ids = claimable.map((o) => BigInt(o.orderId));
        const ok = await claimOrders(BigInt(auction.id), ids);
        if (ok) refresh();
    };

    const handleExtend = async (auction: IndexedAuction) => {
        if (!extendCancelEnd || !extendAuctionEnd) return;
        const newCancelEnd = BigInt(new Date(extendCancelEnd).getTime());
        const newAuctionEnd = BigInt(new Date(extendAuctionEnd).getTime());
        const ok = await extendAuction(BigInt(auction.id), newCancelEnd, newAuctionEnd);
        if (ok) refresh();
    };

    const toggleExpand = (id: string) => {
        setExpandedId((prev) => (prev === id ? null : id));
    };

    if (loading) return <div style={s.loading}>Loading auctions...</div>;
    if (auctions.length === 0) return <div style={s.empty}>No auctions found</div>;

    const upcoming = auctions.filter((a) => a.status === 'upcoming');
    const rest = auctions.filter((a) => a.status !== 'upcoming');

    const renderExpandedDetail = (a: IndexedAuction) => (
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

            {/* Cancel window */}
            {BigInt(a.cancellationEndDate) > 0n && (
                <div style={{ marginBottom: '8px' }}>
                    <div style={s.metaLabel}>Cancel Window Ends</div>
                    <div style={s.metaValue}>{formatTimestamp(BigInt(a.cancellationEndDate))}</div>
                </div>
            )}

            {/* Extend Auction (auctioneer only, non-settled) */}
            {!a.isSettled && connected && walletAddress && a.auctioneerAddress && walletAddress.toLowerCase() === a.auctioneerAddress.toLowerCase() && (
                <div style={s.section}>
                    <div style={sectionTitleStyle}>Extend Auction</div>
                    <div style={s.inputRow}>
                        <div>
                            <label style={labelStyle}>New Cancel Window End</label>
                            <input
                                type="datetime-local"
                                style={inputStyle}
                                value={extendCancelEnd}
                                onChange={(e) => setExtendCancelEnd(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>New Auction End</label>
                            <input
                                type="datetime-local"
                                style={inputStyle}
                                value={extendAuctionEnd}
                                onChange={(e) => setExtendAuctionEnd(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                    <button
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={(e) => { e.stopPropagation(); void handleExtend(a); }}
                    >{busy ? 'Processing...' : 'Extend'}</button>
                </div>
            )}

            {/* Settlement Results */}
            {a.isSettled && clearing && (
                <div style={s.section}>
                    <div style={sectionTitleStyle}>Settlement Results</div>
                    <div style={s.metaGrid}>
                        <div>
                            <div style={s.metaLabel}>Clearing Price</div>
                            <div style={s.clearingPrice}>{formatPrice(BigInt(clearing.clearingSellAmount), BigInt(clearing.clearingBuyAmount))}</div>
                        </div>
                        <div>
                            <div style={s.metaLabel}>Clearing Buy Amount</div>
                            <div style={s.metaValue}>{formatTokenAmount(BigInt(clearing.clearingBuyAmount))}</div>
                        </div>
                        <div>
                            <div style={s.metaLabel}>Clearing Sell Amount</div>
                            <div style={s.metaValue}>{formatTokenAmount(BigInt(clearing.clearingSellAmount))}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Upcoming notice */}
            {a.status === 'upcoming' && (
                <div style={s.section}>
                    <div style={sectionTitleStyle}>Bidding Not Yet Open</div>
                    <div style={{ color: color.textSecondary, fontFamily: font.body, fontSize: '15px' }}>
                        Bidding starts {formatTimestamp(BigInt(a.orderPlacementStartDate))}. Check back then to place your bid.
                    </div>
                </div>
            )}

            {/* Place Bid */}
            {(a.status === 'open' || a.status === 'cancellation_closed') && (
                <div style={s.section}>
                    <div style={sectionTitleStyle}>Place Bid</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={labelStyle}>Bid Amount ({a.biddingTokenSymbol})</label>
                            <input style={inputStyle} value={bidSellAmount} onChange={(e) => onBidAmountChange(e.target.value)} placeholder="0" onClick={(e) => e.stopPropagation()} />
                        </div>
                        <div>
                            <label style={labelStyle}>Max USD per {a.auctioningTokenSymbol}</label>
                            <input style={inputStyle} value={bidMaxUsd} onChange={(e) => onMaxUsdChange(e.target.value)} placeholder="0" onClick={(e) => e.stopPropagation()} />
                        </div>
                        <div>
                            <label style={labelStyle}>Min Receive ({a.auctioningTokenSymbol})</label>
                            <input style={inputStyle} value={bidMinReceive} onChange={(e) => onMinReceiveChange(e.target.value)} placeholder="0" onClick={(e) => e.stopPropagation()} />
                        </div>
                    </div>
                    {biddingTokenUsdPrice === null && (
                        <div style={{ color: color.textMuted, fontSize: '12px', fontFamily: font.body, marginBottom: '12px' }}>
                            USD price unavailable for {a.biddingTokenSymbol} — min receive cannot be computed.
                        </div>
                    )}
                    <button
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={(e) => { e.stopPropagation(); void handleBid(a); }}
                    >{busy ? 'Processing...' : 'Place Bid'}</button>
                </div>
            )}

            {/* Settle */}
            {a.status === 'ended' && (
                <div style={s.section}>
                    <div style={sectionTitleStyle}>Settlement</div>
                    <button
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={(e) => { e.stopPropagation(); void handleSettle(a); }}
                    >{busy ? 'Settling...' : 'Settle Auction'}</button>
                </div>
            )}

            {/* My Bids */}
            {connected && (
                <div style={s.section}>
                    <div style={sectionTitleStyle}>My Bids</div>
                    {ordersLoading ? (
                        <div style={{ color: color.textSecondary, fontFamily: font.body, fontSize: '13px' }}>Loading orders...</div>
                    ) : myOrders.length === 0 ? (
                        <div style={{ color: color.textMuted, fontFamily: font.body, fontSize: '13px' }}>No bids placed yet.</div>
                    ) : (
                        <>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: font.body, fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${color.borderSubtle}`, color: color.textSecondary, textAlign: 'left' }}>
                                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>#</th>
                                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>Bid ({a.biddingTokenSymbol})</th>
                                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>Min Receive ({a.auctioningTokenSymbol})</th>
                                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>Status</th>
                                        <th style={{ padding: '6px 8px', fontWeight: 600 }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myOrders.map((o) => {
                                        const canCancel = !a.isSettled && a.status !== 'ended' && (a.status === 'open') && !o.cancelled && !o.claimed;
                                        const canClaim = a.isSettled && !o.cancelled && !o.claimed;
                                        let statusText = 'Active';
                                        let statusVariant: 'amber' | 'success' | 'muted' = 'amber';
                                        if (o.cancelled) { statusText = 'Cancelled'; statusVariant = 'muted'; }
                                        else if (o.claimed) { statusText = 'Claimed'; statusVariant = 'success'; }
                                        return (
                                            <tr key={o.orderId} style={{ borderBottom: `1px solid ${color.borderSubtle}` }}>
                                                <td style={{ padding: '8px', color: color.textPrimary }}>{o.orderId}</td>
                                                <td style={{ padding: '8px', color: color.textPrimary }}>{formatTokenAmount(BigInt(o.sellAmount))}</td>
                                                <td style={{ padding: '8px', color: color.textPrimary }}>{formatTokenAmount(BigInt(o.buyAmount))}</td>
                                                <td style={{ padding: '8px' }}><span style={badgeStyle(statusVariant)}>{statusText}</span></td>
                                                <td style={{ padding: '8px' }}>
                                                    {canCancel && (
                                                        <button
                                                            style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px', ...(busy ? btnDisabled : {}) }}
                                                            disabled={busy}
                                                            onClick={(e) => { e.stopPropagation(); void handleCancelOrder(a, o.orderId); }}
                                                        >Cancel</button>
                                                    )}
                                                    {canClaim && (
                                                        <button
                                                            style={{ ...btnPrimary, padding: '4px 12px', fontSize: '12px', ...(busy ? btnDisabled : {}) }}
                                                            disabled={busy}
                                                            onClick={(e) => { e.stopPropagation(); void handleClaimOrder(a, o.orderId); }}
                                                        >Claim</button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {a.isSettled && myOrders.some((o) => !o.cancelled && !o.claimed) && (
                                <button
                                    style={{ ...btnPrimary, marginTop: '12px', ...(busy ? btnDisabled : {}) }}
                                    disabled={busy}
                                    onClick={(e) => { e.stopPropagation(); void handleClaimMyOrders(a); }}
                                >{busy ? 'Claiming...' : 'Claim All'}</button>
                            )}
                        </>
                    )}
                </div>
            )}

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
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={(e) => { e.stopPropagation(); void handleClaim(a); }}
                    >{busy ? 'Claiming...' : 'Claim'}</button>
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

    const renderCard = (a: IndexedAuction) => {
        const isHovered = hoveredId === a.id;
        const isExpanded = expandedId === a.id;
        const isUpcoming = a.status === 'upcoming';
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
                    <span style={statusBadge(a.status)}>{statusLabel(a.status)}</span>
                </div>
                <div style={s.label}>Total Auction Tokens</div>
                <div style={s.value}>{formatTokenAmount(BigInt(a.auctionedSellAmount))} {a.auctioningTokenSymbol}</div>
                <div style={s.label}>Min Funding Threshold</div>
                <div style={s.value}>{formatTokenAmount(BigInt(a.minFundingThreshold))} {a.biddingTokenSymbol}</div>
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
                        <div style={s.value}>{formatTokenAmount(BigInt(a.totalBidAmount || '0'))} {a.biddingTokenSymbol}</div>
                    </>
                )}

                {isExpanded && renderExpandedDetail(a)}
            </div>
        );
    };

    return (
        <>
            <div style={{ ...sectionTitleStyle, marginBottom: '16px' }}>Open Auctions</div>
            {upcoming.length > 0 && (
                <>
                    <div style={{ ...sectionTitleStyle, marginBottom: '16px', fontSize: '16px' }}>Upcoming</div>
                    <div style={{ ...s.grid, marginBottom: '32px' }}>{upcoming.map(renderCard)}</div>
                </>
            )}
            {rest.length > 0 && (
                <div style={s.grid}>{rest.map(renderCard)}</div>
            )}
        </>
    );
}
