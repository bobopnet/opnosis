import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount } from '@opnosis/shared';
import {
    color, font, card, btnPrimary, btnSecondary, btnDisabled,
    sectionTitle as sectionTitleStyle, statusMsg, dismissBtn, badge as badgeStyle,
} from '../styles.js';
import type { IndexedAuction, IndexedOrder, IndexedClearing } from '../types.js';
import type { useOpnosis } from '../hooks/useOpnosis.js';

/* ── Styles ────────────────────────────────────────────────────────── */

const s = {
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
    table: {
        width: '100%',
        borderCollapse: 'collapse' as const,
        fontFamily: font.body,
        fontSize: '13px',
    } as React.CSSProperties,
    th: {
        padding: '8px 12px',
        fontWeight: 600,
        textAlign: 'left' as const,
        color: color.textSecondary,
        fontSize: '11px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
    } as React.CSSProperties,
    td: {
        padding: '10px 12px',
        color: color.textPrimary,
    } as React.CSSProperties,
    row: {
        borderBottom: `1px solid ${color.borderSubtle}`,
    } as React.CSSProperties,
    tableWrap: {
        ...card,
        padding: '0',
        overflow: 'hidden',
    } as React.CSSProperties,
    auctionName: {
        fontFamily: font.display,
        fontWeight: 600,
        color: color.textPrimary,
        fontSize: '13px',
    } as React.CSSProperties,
};

/* ── Types ─────────────────────────────────────────────────────────── */

interface BidRow {
    auction: IndexedAuction;
    order: IndexedOrder;
}

type DisplayRow = BidRow & { isPending?: boolean };

const PENDING_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface Props {
    readonly connected: boolean;
    readonly opnosis: ReturnType<typeof useOpnosis>;
}

/* ── Component ─────────────────────────────────────────────────────── */

export function MyBids({ connected, opnosis }: Props) {
    const [rows, setRows] = useState<BidRow[]>([]);
    const [auctions, setAuctions] = useState<IndexedAuction[]>([]);
    const [clearings, setClearings] = useState<Map<string, IndexedClearing>>(new Map());
    const [loading, setLoading] = useState(true);
    const [fetchKey, setFetchKey] = useState(0);
    const [busyKey, setBusyKey] = useState<string | null>(null); // which order or 'all'

    const { txState, resetTx, cancelOrders, claimOrders, hexAddress, completedKeys, markCompleted, pendingBids, removePendingBid } = opnosis;
    const busy = txState.status === 'pending';

    const refresh = useCallback(() => setFetchKey((k) => k + 1), []);

    /* Auto-refresh every 30s so new bids appear without manual navigation */
    useEffect(() => {
        if (!connected) return;
        const timer = setInterval(() => setFetchKey((k) => k + 1), 30_000);
        return () => clearInterval(timer);
    }, [connected]);

    /* Fetch all auctions, then orders for each, filter by wallet */
    useEffect(() => {
        if (!connected || !hexAddress) {
            setRows([]);
            return;
        }
        let cancelled = false;
        setLoading(true);

        async function load() {
            try {
                const res = await fetch(`${API_BASE_URL}/auctions`);
                if (!res.ok) { setRows([]); return; }
                const auctions = await res.json() as IndexedAuction[];

                const withOrders = auctions.filter((a) => Number(a.orderCount) > 0);
                const allRows: BidRow[] = [];

                await Promise.all(withOrders.map(async (auction) => {
                    try {
                        const oRes = await fetch(`${API_BASE_URL}/auctions/${auction.id}/orders`);
                        if (!oRes.ok) return;
                        const orders = await oRes.json() as IndexedOrder[];
                        const mine = orders.filter(
                            (o) => o.userAddress.toLowerCase() === hexAddress.toLowerCase(),
                        );
                        for (const order of mine) {
                            allRows.push({ auction, order });
                        }
                    } catch {
                        // skip this auction
                    }
                }));

                // Fetch clearing data for settled auctions
                const settledIds = [...new Set(withOrders.filter((a) => a.isSettled).map((a) => a.id))];
                const clearingMap = new Map<string, IndexedClearing>();
                await Promise.all(settledIds.map(async (id) => {
                    try {
                        const cRes = await fetch(`${API_BASE_URL}/auctions/${id}/clearing`);
                        if (cRes.ok) {
                            const data = await cRes.json() as IndexedClearing;
                            clearingMap.set(id, data);
                        }
                    } catch { /* clearing unavailable */ }
                }));

                // Most recent bids first (highest auction ID, then highest order ID)
                allRows.sort((a, b) => Number(b.auction.id) - Number(a.auction.id) || b.order.orderId - a.order.orderId);
                if (!cancelled) {
                    setRows(allRows);
                    setAuctions(auctions);
                    setClearings(clearingMap);
                }
            } catch {
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => { cancelled = true; };
    }, [connected, hexAddress, fetchKey]);

    const bidKey = (auctionId: string, orderId: number) => `${auctionId}-${orderId}`;

    const handleCancel = async (row: BidRow) => {
        const key = bidKey(row.auction.id, row.order.orderId);
        setBusyKey(key);
        const ok = await cancelOrders(BigInt(row.auction.id), [BigInt(row.order.orderId)]);
        setBusyKey(null);
        if (ok) {
            markCompleted(key, 'cancelled');
            refresh();
        }
    };

    const handleClaim = async (row: BidRow) => {
        const key = bidKey(row.auction.id, row.order.orderId);
        setBusyKey(key);
        const ok = await claimOrders(BigInt(row.auction.id), [BigInt(row.order.orderId)]);
        setBusyKey(null);
        if (ok) {
            markCompleted(key, 'claimed');
            refresh();
        }
    };

    const handleClaimAll = async () => {
        const claimable = rows.filter((r) => {
            const key = bidKey(r.auction.id, r.order.orderId);
            const done = completedKeys.get(key);
            return r.auction.isSettled && !r.order.cancelled && !r.order.claimed
                && done !== 'claimed' && done !== 'cancelled';
        });
        if (claimable.length === 0) return;
        setBusyKey('all');
        // Group by auction ID for batch claiming
        const byAuction = new Map<string, bigint[]>();
        for (const r of claimable) {
            const ids = byAuction.get(r.auction.id) ?? [];
            ids.push(BigInt(r.order.orderId));
            byAuction.set(r.auction.id, ids);
        }
        for (const [auctionId, orderIds] of byAuction) {
            const ok = await claimOrders(BigInt(auctionId), orderIds);
            if (!ok) { setBusyKey(null); return; }
            for (const oid of orderIds) {
                markCompleted(bidKey(auctionId, Number(oid)), 'claimed');
            }
        }
        setBusyKey(null);
        refresh();
    };

    /* ── Clean up matched/expired pending bids (side effect → useEffect) ── */

    useEffect(() => {
        const now = Date.now();
        for (const pb of pendingBids) {
            if (now - pb.timestamp > PENDING_EXPIRY_MS) {
                removePendingBid(pb.auctionId, pb.sellAmount, pb.buyAmount);
                continue;
            }
            const matched = rows.some(
                (r) => r.auction.id === pb.auctionId && r.order.sellAmount === pb.sellAmount,
            );
            if (matched) {
                removePendingBid(pb.auctionId, pb.sellAmount, pb.buyAmount);
            }
        }
    }, [rows, pendingBids, removePendingBid]);

    /* ── Merge pending bids with real rows (pure — no side effects) ──── */

    const displayRows: DisplayRow[] = useMemo(() => {
        const now = Date.now();
        const result: DisplayRow[] = [...rows];

        // Add unmatched, non-expired pending bids as synthetic rows
        for (const pb of pendingBids) {
            if (now - pb.timestamp > PENDING_EXPIRY_MS) continue;
            const matched = rows.some(
                (r) => r.auction.id === pb.auctionId && r.order.sellAmount === pb.sellAmount,
            );
            if (matched) continue;

            const auction = auctions.find((a) => a.id === pb.auctionId);
            if (!auction) continue;
            result.unshift({
                auction,
                order: {
                    orderId: -1,
                    buyAmount: pb.buyAmount,
                    sellAmount: pb.sellAmount,
                    userId: '',
                    userAddress: hexAddress,
                    cancelled: false,
                    claimed: false,
                },
                isPending: true,
            });
        }

        return result;
    }, [rows, pendingBids, auctions, hexAddress]);

    /* ── Render ─────────────────────────────────────────────────── */

    if (!connected) {
        return (
            <>
                <div style={sectionTitleStyle}>My Bids</div>
                <div style={s.empty}>Connect wallet to view your bids</div>
            </>
        );
    }

    if (loading) {
        return (
            <>
                <div style={sectionTitleStyle}>My Bids</div>
                <div style={s.loading}>Loading your bids...</div>
            </>
        );
    }

    if (displayRows.length === 0) {
        return (
            <>
                <div style={sectionTitleStyle}>My Bids</div>
                <div style={s.empty}>No bids found</div>
            </>
        );
    }

    const claimableCount = rows.filter((r) => {
        const key = bidKey(r.auction.id, r.order.orderId);
        const done = completedKeys.get(key);
        return r.auction.isSettled && !r.order.cancelled && !r.order.claimed
            && done !== 'claimed' && done !== 'cancelled';
    }).length;

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={sectionTitleStyle}>My Bids</div>
                {claimableCount >= 2 && (
                    <button
                        className="glow-amber"
                        style={{ ...btnPrimary, padding: '8px 18px', fontSize: '13px', ...(busy ? btnDisabled : {}) }}
                        disabled={busy}
                        onClick={() => void handleClaimAll()}
                    >{busyKey === 'all' ? 'Processing...' : 'Claim All'}</button>
                )}
            </div>

            <div style={s.tableWrap}>
                <table style={s.table}>
                    <thead>
                        <tr style={{ borderBottom: `1px solid ${color.borderStrong}`, background: color.bgElevated }}>
                            <th style={s.th}>Auction</th>
                            <th style={s.th}>Bid Amount</th>
                            <th style={s.th}>Min Receive</th>
                            <th style={s.th}>Received</th>
                            <th style={s.th}>Status</th>
                            <th style={s.th}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map((r, idx) => {
                            const { auction: a, order: o } = r;

                            if (r.isPending) {
                                return (
                                    <tr key={`pending-${idx}`} style={s.row}>
                                        <td style={s.td}>
                                            <div style={s.auctionName}>{a.auctioningTokenName || 'Auction'}</div>
                                        </td>
                                        <td style={s.td}>{formatTokenAmount(BigInt(o.sellAmount), a.biddingTokenDecimals).split('.')[0]} {a.biddingTokenSymbol}</td>
                                        <td style={s.td}>{formatTokenAmount(BigInt(o.buyAmount), a.auctioningTokenDecimals).split('.')[0]} {a.auctioningTokenSymbol}</td>
                                        <td style={s.td}>--</td>
                                        <td style={s.td}><span style={badgeStyle('pending')}>Pending</span></td>
                                        <td style={s.td}></td>
                                    </tr>
                                );
                            }

                            const key = bidKey(a.id, o.orderId);
                            const doneAction = completedKeys.get(key);
                            const isClaimed = o.claimed || doneAction === 'claimed';
                            const isCancelled = o.cancelled || doneAction === 'cancelled';
                            const hasCancelWindow = BigInt(a.cancellationEndDate) > BigInt(a.orderPlacementStartDate || '0');
                            const canCancel = hasCancelWindow && !a.isSettled && a.status === 'open' && !isCancelled && !isClaimed;
                            const canClaim = a.isSettled && !isCancelled && !isClaimed;

                            let statusText = 'Active';
                            let statusVariant: 'amber' | 'success' | 'muted' = 'amber';
                            if (isCancelled) { statusText = 'Cancelled'; statusVariant = 'muted'; }
                            else if (isClaimed) { statusText = 'Claimed'; statusVariant = 'success'; }

                            return (
                                <tr key={`${a.id}-${o.orderId}`} style={s.row}>
                                    <td style={s.td}>
                                        <div style={s.auctionName}>{a.auctioningTokenName || 'Auction'}</div>
                                    </td>
                                    <td style={s.td}>{formatTokenAmount(BigInt(o.sellAmount), a.biddingTokenDecimals).split('.')[0]} {a.biddingTokenSymbol}</td>
                                    <td style={s.td}>{formatTokenAmount(BigInt(o.buyAmount), a.auctioningTokenDecimals).split('.')[0]} {a.auctioningTokenSymbol}</td>
                                    <td style={s.td}>{(() => {
                                        if (isCancelled) return '--';
                                        const cl = clearings.get(a.id);
                                        if (!cl || !a.isSettled) return '--';
                                        const sell = BigInt(o.sellAmount);
                                        const clearBuy = BigInt(cl.clearingBuyAmount);
                                        const clearSell = BigInt(cl.clearingSellAmount);
                                        if (clearSell === 0n) return '--';
                                        const received = sell * clearBuy / clearSell;
                                        return `${formatTokenAmount(received, a.auctioningTokenDecimals).split('.')[0]} ${a.auctioningTokenSymbol}`;
                                    })()}</td>
                                    <td style={s.td}><span style={badgeStyle(statusVariant)}>{statusText}</span></td>
                                    <td style={s.td}>
                                        {canCancel && (
                                            <button
                                                className="glow-purple"
                                                style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px', ...(busy ? btnDisabled : {}) }}
                                                disabled={busy}
                                                onClick={() => void handleCancel(r)}
                                            >{busyKey === key ? 'Processing...' : 'Cancel'}</button>
                                        )}
                                        {canClaim && (
                                            <button
                                                className="glow-amber"
                                                style={{ ...btnPrimary, padding: '4px 12px', fontSize: '12px', ...(busy ? btnDisabled : {}) }}
                                                disabled={busy}
                                                onClick={() => void handleClaim(r)}
                                            >{busyKey === key ? 'Processing...' : 'Claim'}</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Tx status */}
            {txState.status !== 'idle' && (
                <div style={statusMsg(txState.status === 'error')}>
                    {txState.message}
                    {(txState.status === 'success' || txState.status === 'error') && (
                        <button style={dismissBtn} onClick={() => resetTx()}>dismiss</button>
                    )}
                </div>
            )}
        </>
    );
}
