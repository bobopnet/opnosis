import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount } from '@opnosis/shared';
import {
    color, font, card, btnPrimary, btnSecondary, btnDisabled,
    sectionTitle as sectionTitleStyle, statusMsg, dismissBtn, badge as badgeStyle,
} from '../styles.js';
import type { IndexedAuction, IndexedOrder } from '../types.js';
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
    auctionId: {
        color: color.textMuted,
        fontSize: '11px',
        fontFamily: font.body,
    } as React.CSSProperties,
};

/* ── Types ─────────────────────────────────────────────────────────── */

interface BidRow {
    auction: IndexedAuction;
    order: IndexedOrder;
}

interface Props {
    readonly connected: boolean;
    readonly opnosis: ReturnType<typeof useOpnosis>;
}

/* ── Component ─────────────────────────────────────────────────────── */

export function MyBids({ connected, opnosis }: Props) {
    const [rows, setRows] = useState<BidRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchKey, setFetchKey] = useState(0);

    const { txState, resetTx, cancelOrders, claimOrders, hexAddress } = opnosis;
    const busy = txState.status === 'pending';

    const refresh = useCallback(() => setFetchKey((k) => k + 1), []);

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

                if (!cancelled) setRows(allRows);
            } catch {
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => { cancelled = true; };
    }, [connected, hexAddress, fetchKey]);

    const handleCancel = async (row: BidRow) => {
        const ok = await cancelOrders(BigInt(row.auction.id), [BigInt(row.order.orderId)]);
        if (ok) refresh();
    };

    const handleClaim = async (row: BidRow) => {
        const ok = await claimOrders(BigInt(row.auction.id), [BigInt(row.order.orderId)]);
        if (ok) refresh();
    };

    const handleClaimAll = async () => {
        const claimable = rows.filter((r) => r.auction.isSettled && !r.order.cancelled && !r.order.claimed);
        if (claimable.length === 0) return;
        // Group by auction ID for batch claiming
        const byAuction = new Map<string, bigint[]>();
        for (const r of claimable) {
            const ids = byAuction.get(r.auction.id) ?? [];
            ids.push(BigInt(r.order.orderId));
            byAuction.set(r.auction.id, ids);
        }
        for (const [auctionId, orderIds] of byAuction) {
            const ok = await claimOrders(BigInt(auctionId), orderIds);
            if (!ok) return;
        }
        refresh();
    };

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

    if (rows.length === 0) {
        return (
            <>
                <div style={sectionTitleStyle}>My Bids</div>
                <div style={s.empty}>No bids found</div>
            </>
        );
    }

    const hasClaimable = rows.some((r) => r.auction.isSettled && !r.order.cancelled && !r.order.claimed);

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={sectionTitleStyle}>My Bids</div>
                {hasClaimable && (
                    <button
                        style={{ ...btnPrimary, padding: '8px 18px', fontSize: '13px', ...(busy ? btnDisabled : {}) }}
                        disabled={busy}
                        onClick={() => void handleClaimAll()}
                    >{busy ? 'Processing...' : 'Claim All'}</button>
                )}
            </div>

            <div style={s.tableWrap}>
                <table style={s.table}>
                    <thead>
                        <tr style={{ borderBottom: `1px solid ${color.borderStrong}`, background: color.bgElevated }}>
                            <th style={s.th}>Auction</th>
                            <th style={s.th}>Bid Amount</th>
                            <th style={s.th}>Min Receive</th>
                            <th style={s.th}>Status</th>
                            <th style={s.th}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => {
                            const { auction: a, order: o } = r;
                            const canCancel = !a.isSettled && a.status !== 'ended' && a.status === 'open' && !o.cancelled && !o.claimed;
                            const canClaim = a.isSettled && !o.cancelled && !o.claimed;

                            let statusText = 'Active';
                            let statusVariant: 'amber' | 'success' | 'muted' = 'amber';
                            if (o.cancelled) { statusText = 'Cancelled'; statusVariant = 'muted'; }
                            else if (o.claimed) { statusText = 'Claimed'; statusVariant = 'success'; }

                            return (
                                <tr key={`${a.id}-${o.orderId}`} style={s.row}>
                                    <td style={s.td}>
                                        <div style={s.auctionName}>{a.auctioningTokenName || 'Auction'}</div>
                                        <div style={s.auctionId}>#{a.id}</div>
                                    </td>
                                    <td style={s.td}>{formatTokenAmount(BigInt(o.sellAmount))} {a.biddingTokenSymbol}</td>
                                    <td style={s.td}>{formatTokenAmount(BigInt(o.buyAmount))} {a.auctioningTokenSymbol}</td>
                                    <td style={s.td}><span style={badgeStyle(statusVariant)}>{statusText}</span></td>
                                    <td style={s.td}>
                                        {canCancel && (
                                            <button
                                                style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px', ...(busy ? btnDisabled : {}) }}
                                                disabled={busy}
                                                onClick={() => void handleCancel(r)}
                                            >Cancel</button>
                                        )}
                                        {canClaim && (
                                            <button
                                                style={{ ...btnPrimary, padding: '4px 12px', fontSize: '12px', ...(busy ? btnDisabled : {}) }}
                                                disabled={busy}
                                                onClick={() => void handleClaim(r)}
                                            >Claim</button>
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
