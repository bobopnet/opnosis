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
    const [usdPrices, setUsdPrices] = useState<Map<string, number>>(new Map());
    const [fetchKey, setFetchKey] = useState(0);
    const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
    const addBusy = useCallback((k: string) => setBusyKeys((s) => new Set(s).add(k)), []);
    const removeBusy = useCallback((k: string) => setBusyKeys((s) => { const n = new Set(s); n.delete(k); return n; }), []);
    const [backendDown, setBackendDown] = useState(false);

    const { txState, resetTx, cancelOrders, claimOrders, settleAuction, hexAddress, completedKeys, markCompleted, pendingBids, removePendingBid } = opnosis;

    const refresh = useCallback(() => setFetchKey((k) => k + 1), []);

    /* Auto-refresh every 30s so new bids appear without manual navigation */
    useEffect(() => {
        if (!connected) return;
        const timer = setInterval(() => setFetchKey((k) => k + 1), 30_000);
        return () => clearInterval(timer);
    }, [connected]);

    /* Check backend health every 30s — show manual claim buttons only when backend is down */
    useEffect(() => {
        async function check() {
            try {
                const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(5_000) });
                setBackendDown(!res.ok);
            } catch {
                setBackendDown(true);
            }
        }
        void check();
        const timer = setInterval(() => void check(), 30_000);
        return () => clearInterval(timer);
    }, []);

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

                const normAddr = hexAddress.replace(/^0x/i, '').toLowerCase();
                await Promise.all(withOrders.map(async (auction) => {
                    try {
                        const oRes = await fetch(`${API_BASE_URL}/auctions/${auction.id}/orders?address=${encodeURIComponent(hexAddress)}`);
                        if (!oRes.ok) return;
                        const orders = await oRes.json() as IndexedOrder[];
                        // Client-side filter as fallback (server filter may not be deployed yet)
                        const mine = orders.filter(
                            (o) => o.userAddress.replace(/^0x/i, '').toLowerCase() === normAddr,
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

                // Fetch USD prices for bidding tokens used in the user's bids
                const biddingTokens = [...new Set(allRows.map((r) => r.auction.biddingToken))];
                const priceMap = new Map<string, number>();
                await Promise.all(biddingTokens.map(async (token) => {
                    try {
                        const pRes = await fetch(`${API_BASE_URL}/price/${token}`);
                        if (pRes.ok) {
                            const data = await pRes.json() as { usd: number };
                            if (data.usd > 0) priceMap.set(token, data.usd);
                        }
                    } catch { /* price unavailable */ }
                }));

                // Most recent bids first (highest auction ID, then highest order ID)
                allRows.sort((a, b) => Number(b.auction.id) - Number(a.auction.id) || b.order.orderId - a.order.orderId);
                if (!cancelled) {
                    setRows(allRows);
                    setAuctions(auctions);
                    setClearings(clearingMap);
                    setUsdPrices(priceMap);
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
        addBusy(key);
        const ok = await cancelOrders(BigInt(row.auction.id), [BigInt(row.order.orderId)]);
        removeBusy(key);
        if (ok) {
            markCompleted(key, 'cancelled');
            refresh();
        }
    };

    /** Settle then wait for on-chain confirmation before returning. */
    const settleAndWait = async (auctionId: string): Promise<boolean> => {
        const ok = await settleAuction(BigInt(auctionId));
        if (!ok) return false;
        resetTx();
        // Poll API until isSettled flips to true (settlement TX confirmed)
        for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 15_000));
            try {
                const res = await fetch(`${API_BASE_URL}/auctions/${auctionId}`);
                if (res.ok) {
                    const data = await res.json() as IndexedAuction;
                    if (data.isSettled) return true;
                }
            } catch { /* keep polling */ }
        }
        return false;
    };

    const handleClaim = async (row: BidRow) => {
        const key = bidKey(row.auction.id, row.order.orderId);
        addBusy(key);
        if (!row.auction.isSettled) {
            const confirmed = await settleAndWait(row.auction.id);
            if (!confirmed) { removeBusy(key); return; }
        }
        const ok = await claimOrders(BigInt(row.auction.id), [BigInt(row.order.orderId)]);
        removeBusy(key);
        if (ok) {
            markCompleted(key, 'claimed');
            refresh();
        }
    };

    const isRefundable = (r: BidRow) => {
        const key = bidKey(r.auction.id, r.order.orderId);
        const done = completedKeys.get(key);
        if (r.order.cancelled || r.order.claimed || done === 'claimed' || done === 'cancelled') return false;
        const a = r.auction;
        const clientEnded = BigInt(Date.now()) >= BigInt(a.auctionEndDate);
        const aStatus = (a.status === 'ended' || a.status === 'settled' || clientEnded) ? (a.isSettled ? 'settled' : 'ended') : a.status;
        const minFunding = BigInt(a.minFundingThreshold || '0');
        const totalBid = BigInt(a.totalBidAmount || '0');
        return a.fundingNotReached || (aStatus === 'ended' && minFunding > 0n && totalBid < minFunding);
    };

    const handleClaimAllRefunds = async () => {
        const refundable = rows.filter(isRefundable);
        if (refundable.length === 0) return;
        addBusy('all-refunds');
        // Settle any unsettled auctions first, wait for on-chain confirmation
        const unsettledIds = new Set(refundable.filter((r) => !r.auction.isSettled).map((r) => r.auction.id));
        for (const auctionId of unsettledIds) {
            const confirmed = await settleAndWait(auctionId);
            if (!confirmed) { removeBusy('all-refunds'); return; }
        }
        const byAuction = new Map<string, bigint[]>();
        for (const r of refundable) {
            const ids = byAuction.get(r.auction.id) ?? [];
            ids.push(BigInt(r.order.orderId));
            byAuction.set(r.auction.id, ids);
        }
        for (const [auctionId, orderIds] of byAuction) {
            const ok = await claimOrders(BigInt(auctionId), orderIds);
            if (!ok) { removeBusy('all-refunds'); return; }
            for (const oid of orderIds) {
                markCompleted(bidKey(auctionId, Number(oid)), 'claimed');
            }
        }
        removeBusy('all-refunds');
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

        // Add unmatched, non-expired pending bids for the current wallet only
        for (const pb of pendingBids) {
            if (now - pb.timestamp > PENDING_EXPIRY_MS) continue;
            if (pb.address.toLowerCase() !== hexAddress.toLowerCase()) continue;
            const matched = rows.some(
                (r) => r.auction.id === pb.auctionId && r.order.sellAmount === pb.sellAmount,
            );
            if (matched) continue;

            const auction = auctions.find((a) => a.id === pb.auctionId);
            // Build auction metadata from fetched data or pending bid snapshot
            const auctionData: IndexedAuction = auction ?? {
                id: pb.auctionId,
                auctioningToken: '',
                auctioningTokenName: pb.auctionSnapshot?.auctioningTokenSymbol || 'Unknown',
                auctioningTokenSymbol: pb.auctionSnapshot?.auctioningTokenSymbol || '???',
                biddingToken: '',
                biddingTokenName: pb.auctionSnapshot?.biddingTokenSymbol || 'Unknown',
                biddingTokenSymbol: pb.auctionSnapshot?.biddingTokenSymbol || '???',
                orderPlacementStartDate: '0',
                auctionEndDate: '0',
                cancellationEndDate: '0',
                auctionedSellAmount: '0',
                minBuyAmount: '0',
                minimumBiddingAmountPerOrder: '0',
                minFundingThreshold: '0',
                isAtomicClosureAllowed: false,
                orderCount: '0',
                totalBidAmount: '0',
                isSettled: false,
                status: 'open',
                auctioningTokenDecimals: pb.auctionSnapshot?.auctioningTokenDecimals ?? 18,
                biddingTokenDecimals: pb.auctionSnapshot?.biddingTokenDecimals ?? 18,
                auctioneerAddress: '',
                hasCancelWindow: false,
                fundingNotReached: false,
            };
            result.unshift({
                auction: auctionData,
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

    const refundableCount = rows.filter(isRefundable).length;

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={sectionTitleStyle}>My Bids</div>
                {backendDown && refundableCount >= 2 && (
                    <button
                        className="glow-purple"
                        style={{ ...btnSecondary, padding: '8px 18px', fontSize: '13px', ...(busyKeys.has('all-refunds') ? btnDisabled : {}) }}
                        disabled={busyKeys.has('all-refunds')}
                        onClick={() => void handleClaimAllRefunds()}
                    >{busyKeys.has('all-refunds') ? 'Processing...' : 'Claim All Refunds'}</button>
                )}
            </div>

            <div style={s.tableWrap}>
                <table style={s.table}>
                    <thead>
                        <tr style={{ borderBottom: `1px solid ${color.borderStrong}`, background: color.bgElevated }}>
                            <th style={s.th}>Auction</th>
                            <th style={s.th}>Bid Amount</th>
                            <th style={s.th}>Min Receive</th>
                            <th style={s.th}>Max USD/Token</th>
                            <th style={s.th}>Received</th>
                            <th style={s.th}>Paid USD/Token</th>
                            <th style={s.th}>Status</th>
                            <th style={s.th}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map((r, idx) => {
                            const { auction: a, order: o } = r;

                            if (r.isPending) {
                                const pUsd = usdPrices.get(a.biddingToken);
                                const pendingMaxUsd = (() => {
                                    if (!pUsd) return '--';
                                    const sell = BigInt(o.sellAmount);
                                    const buy = BigInt(o.buyAmount);
                                    if (buy === 0n) return '--';
                                    const sellF = Number(sell) / 10 ** a.biddingTokenDecimals;
                                    const buyF = Number(buy) / 10 ** a.auctioningTokenDecimals;
                                    return `$${(sellF / buyF * pUsd).toFixed(4)}`;
                                })();
                                return (
                                    <tr key={`pending-${idx}`} style={s.row}>
                                        <td style={s.td}>
                                            <div style={s.auctionName}>{a.auctioningTokenName || 'Auction'}</div>
                                        </td>
                                        <td style={s.td}>{formatTokenAmount(BigInt(o.sellAmount), a.biddingTokenDecimals).split('.')[0]} {a.biddingTokenSymbol}</td>
                                        <td style={s.td}>{formatTokenAmount(BigInt(o.buyAmount), a.auctioningTokenDecimals).split('.')[0]} {a.auctioningTokenSymbol}</td>
                                        <td style={s.td}>{pendingMaxUsd}</td>
                                        <td style={s.td}>--</td>
                                        <td style={s.td}>--</td>
                                        <td style={s.td}>
                                            <span style={badgeStyle('pending')}>Pending</span>
                                        </td>
                                        <td style={s.td}></td>
                                    </tr>
                                );
                            }

                            const key = bidKey(a.id, o.orderId);
                            const doneAction = completedKeys.get(key);
                            const isClaimed = o.claimed || doneAction === 'claimed';
                            const isCancelled = o.cancelled || doneAction === 'cancelled';
                            // Use backend status, only advance forward with client time
                            const clientEnded = BigInt(Date.now()) >= BigInt(a.auctionEndDate);
                            const aStatus = (a.status === 'ended' || a.status === 'settled' || clientEnded) ? (a.isSettled ? 'settled' : 'ended') : a.status;
                            const canCancel = a.hasCancelWindow && !a.isSettled && aStatus === 'open' && !isCancelled && !isClaimed;
                            const canClaim = a.isSettled && !isCancelled && !isClaimed;

                            const minFunding = BigInt(a.minFundingThreshold || '0');
                            const totalBid = BigInt(a.totalBidAmount || '0');
                            const isFailed = a.fundingNotReached
                                || (aStatus === 'ended' && minFunding > 0n && totalBid < minFunding);
                            // Show Claim Refund as soon as the auction has ended and failed —
                            // don't wait for on-chain settlement (auto-settle will handle it,
                            // or the user can settle manually).
                            const canClaimRefund = isFailed && !isClaimed && !isCancelled;

                            let statusText = 'Active';
                            let statusVariant: 'amber' | 'success' | 'muted' | 'pending' = 'amber';
                            if (isCancelled) { statusText = 'Cancelled'; statusVariant = 'muted'; }
                            else if (isFailed && isClaimed) { statusText = 'Refunded'; statusVariant = 'success'; }
                            else if (isClaimed) { statusText = 'Sent'; statusVariant = 'success'; }
                            else if (isFailed && !backendDown) { statusText = 'Refunding...'; statusVariant = 'pending'; }
                            else if (isFailed) { statusText = 'Failed'; statusVariant = 'muted'; }
                            else if (canClaim && !backendDown) { statusText = 'Distributing...'; statusVariant = 'pending'; }

                            const bUsd = usdPrices.get(a.biddingToken);
                            // Max USD/Token = (sellAmount / buyAmount) * biddingTokenUsdPrice
                            const maxUsdPerToken = (() => {
                                if (!bUsd) return '--';
                                const sell = BigInt(o.sellAmount);
                                const buy = BigInt(o.buyAmount);
                                if (buy === 0n) return '--';
                                const sellF = Number(sell) / 10 ** a.biddingTokenDecimals;
                                const buyF = Number(buy) / 10 ** a.auctioningTokenDecimals;
                                return `$${(sellF / buyF * bUsd).toFixed(4)}`;
                            })();
                            // Paid USD/Token = (clearingSellAmount / clearingBuyAmount) * biddingTokenUsdPrice
                            const paidUsdPerToken = (() => {
                                if (!bUsd || isCancelled || isFailed) return '--';
                                const cl = clearings.get(a.id);
                                if (!cl || !a.isSettled) return '--';
                                const clSell = BigInt(cl.clearingSellAmount);
                                const clBuy = BigInt(cl.clearingBuyAmount);
                                if (clBuy === 0n) return '--';
                                const clSellF = Number(clSell) / 10 ** a.biddingTokenDecimals;
                                const clBuyF = Number(clBuy) / 10 ** a.auctioningTokenDecimals;
                                return `$${(clSellF / clBuyF * bUsd).toFixed(4)}`;
                            })();

                            return (
                                <tr key={`${a.id}-${o.orderId}`} style={s.row}>
                                    <td style={s.td}>
                                        <div style={s.auctionName}>{a.auctioningTokenName || 'Auction'}</div>
                                    </td>
                                    <td style={s.td}>{formatTokenAmount(BigInt(o.sellAmount), a.biddingTokenDecimals).split('.')[0]} {a.biddingTokenSymbol}</td>
                                    <td style={s.td}>{formatTokenAmount(BigInt(o.buyAmount), a.auctioningTokenDecimals).split('.')[0]} {a.auctioningTokenSymbol}</td>
                                    <td style={s.td}>{maxUsdPerToken}</td>
                                    <td style={s.td}>{(() => {
                                        if (isCancelled || isFailed) return '--';
                                        const cl = clearings.get(a.id);
                                        if (!cl || !a.isSettled) return '--';
                                        const sell = BigInt(o.sellAmount);
                                        const clearBuy = BigInt(cl.clearingBuyAmount);
                                        const clearSell = BigInt(cl.clearingSellAmount);
                                        if (clearSell === 0n) return '--';
                                        const received = sell * clearBuy / clearSell;
                                        return `${formatTokenAmount(received, a.auctioningTokenDecimals).split('.')[0]} ${a.auctioningTokenSymbol}`;
                                    })()}</td>
                                    <td style={s.td}>{paidUsdPerToken}</td>
                                    <td style={s.td}><span style={badgeStyle(statusVariant)}>{statusText}</span></td>
                                    <td style={s.td}>
                                        {canCancel && (
                                            <button
                                                className="glow-purple"
                                                style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px', ...(busyKeys.has(key) ? btnDisabled : {}) }}
                                                disabled={busyKeys.has(key)}
                                                onClick={() => void handleCancel(r)}
                                            >{busyKeys.has(key) ? 'Processing...' : 'Cancel'}</button>
                                        )}
                                        {backendDown && canClaim && !isFailed && (
                                            <button
                                                className="glow-amber"
                                                style={{ ...btnPrimary, padding: '4px 12px', fontSize: '12px', ...(busyKeys.has(key) ? btnDisabled : {}) }}
                                                disabled={busyKeys.has(key)}
                                                onClick={() => void handleClaim(r)}
                                            >{busyKeys.has(key) ? 'Processing...' : 'Claim'}</button>
                                        )}
                                        {backendDown && canClaimRefund && (
                                            <button
                                                className="glow-purple"
                                                style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px', ...(busyKeys.has(key) ? btnDisabled : {}) }}
                                                disabled={busyKeys.has(key)}
                                                onClick={() => void handleClaim(r)}
                                            >{busyKeys.has(key) ? 'Processing...' : 'Claim Refund'}</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Backend down notice */}
            {backendDown && (
                <div style={{ ...statusMsg(true), marginTop: '12px' }}>
                    Automatic distribution is temporarily unavailable. You can manually claim your tokens using the buttons above.
                </div>
            )}

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
