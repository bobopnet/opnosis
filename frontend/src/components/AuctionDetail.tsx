import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount, formatTimestamp, formatPrice, parseTokenAmount, FEE_NUMERATOR, FEE_DENOMINATOR } from '@opnosis/shared';
import {
    color, font, card, btnPrimary, btnDisabled, input as inputStyle,
    label as labelStyle, sectionTitle, statusMsg, dismissBtn, badge as badgeStyle,
} from '../styles.js';
import type { IndexedAuction, IndexedClearing } from '../types.js';
import type { useOpnosis } from '../hooks/useOpnosis.js';

const s = {
    container: {
        ...card,
        borderLeft: `1px solid ${color.borderSubtle}`,
    } as React.CSSProperties,
    back: {
        background: 'none',
        border: 'none',
        color: color.amber,
        cursor: 'pointer',
        marginBottom: '20px',
        fontSize: '14px',
        fontFamily: font.body,
        padding: 0,
        transition: 'color 0.2s',
    } as React.CSSProperties,
    titleRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
    } as React.CSSProperties,
    title: {
        fontSize: '24px',
        fontWeight: 700,
        fontFamily: font.display,
        color: color.textPrimary,
    } as React.CSSProperties,
    grid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '24px',
    } as React.CSSProperties,
    metaLabel: {
        ...labelStyle,
        fontSize: '11px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        color: color.textMuted,
    } as React.CSSProperties,
    metaValue: {
        color: color.textPrimary,
        fontSize: '14px',
        fontFamily: font.body,
        fontWeight: 500,
    } as React.CSSProperties,
    tokenAddr: {
        fontSize: '11px',
        color: color.textSecondary,
        fontFamily: font.body,
        wordBreak: 'break-all' as const,
    } as React.CSSProperties,
    section: {
        marginTop: '28px',
        paddingTop: '24px',
        borderTop: `1px solid ${color.borderSubtle}`,
    } as React.CSSProperties,
    inputRow: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '16px',
    } as React.CSSProperties,
    clearingPrice: {
        fontFamily: font.display,
        fontSize: '24px',
        fontWeight: 700,
        color: color.amber,
    } as React.CSSProperties,
};

interface Props {
    readonly auctionId: string;
    readonly connected: boolean;
    readonly opnosis: ReturnType<typeof useOpnosis>;
    readonly onBack: () => void;
}

export function AuctionDetail({ auctionId, connected, opnosis, onBack }: Props) {
    const [auction, setAuction] = useState<IndexedAuction | null>(null);
    const [loading, setLoading] = useState(true);
    const [bidSellAmount, setBidSellAmount] = useState('');
    const [bidMinBuy, setBidMinBuy] = useState('');
    const [claimOrderIds, setClaimOrderIds] = useState('');
    const [clearing, setClearing] = useState<IndexedClearing | null>(null);

    const { txState, resetTx, placeOrders, settleAuction, claimOrders, approveToken } = opnosis;
    const busy = txState.status === 'pending';
    const [fetchKey, setFetchKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch(`${API_BASE_URL}/auctions/${auctionId}`);
                if (!res.ok) throw new Error('Not found');
                const data = await res.json() as IndexedAuction;
                if (!cancelled) setAuction(data);
            } catch {
                if (!cancelled) setAuction(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [auctionId, fetchKey]);

    useEffect(() => {
        if (!auction?.isSettled) {
            setClearing(null);
            return;
        }
        let cancelled = false;
        async function loadClearing() {
            try {
                const res = await fetch(`${API_BASE_URL}/auctions/${auctionId}/clearing`);
                if (!res.ok) return;
                const data = await res.json() as IndexedClearing;
                if (!cancelled) setClearing(data);
            } catch {
                // clearing data unavailable
            }
        }
        void loadClearing();
        return () => { cancelled = true; };
    }, [auction?.isSettled, auctionId, fetchKey]);

    const refresh = () => setFetchKey((k) => k + 1);

    if (loading) return <div style={{ color: color.textSecondary, padding: '48px', textAlign: 'center', fontFamily: font.body }}>Loading...</div>;
    if (!auction) return <div style={{ color: color.error, padding: '48px', textAlign: 'center', fontFamily: font.body }}>Auction not found</div>;

    const handleBid = async () => {
        if (!bidSellAmount || !bidMinBuy) return;
        const approved = await approveToken(auction.biddingToken, parseTokenAmount(bidSellAmount));
        if (!approved) return;
        const ok = await placeOrders(
            BigInt(auction.id),
            [parseTokenAmount(bidMinBuy)],
            [parseTokenAmount(bidSellAmount)],
        );
        if (ok) refresh();
    };

    const handleSettle = async () => {
        const ok = await settleAuction(BigInt(auction.id));
        if (ok) refresh();
    };

    const handleClaim = async () => {
        const ids = claimOrderIds.split(',').map((v) => BigInt(v.trim())).filter((n) => n > 0n);
        if (ids.length === 0) return;
        const ok = await claimOrders(BigInt(auction.id), ids);
        if (ok) refresh();
    };

    const statusVariant = auction.status === 'open' ? 'amber' as const
        : auction.status === 'settled' ? 'success' as const
        : 'muted' as const;

    return (
        <div style={s.container}>
            <button style={s.back} onClick={onBack}>&larr; Back to auctions</button>

            <div style={s.titleRow}>
                <div style={s.title}>Auction #{auction.id}</div>
                <span style={badgeStyle(statusVariant)}>{auction.status}</span>
            </div>

            <div style={s.grid}>
                <div><div style={s.metaLabel}>Status</div><div style={s.metaValue}>{auction.status}</div></div>
                <div><div style={s.metaLabel}>Orders</div><div style={s.metaValue}>{auction.orderCount} / 100</div></div>
                <div><div style={s.metaLabel}>Sell Amount</div><div style={s.metaValue}>{formatTokenAmount(BigInt(auction.auctionedSellAmount))}</div></div>
                <div><div style={s.metaLabel}>Min Buy Amount</div><div style={s.metaValue}>{formatTokenAmount(BigInt(auction.minBuyAmount))}</div></div>
                <div><div style={s.metaLabel}>Cancel Deadline</div><div style={s.metaValue}>{formatTimestamp(BigInt(auction.cancellationEndDate))}</div></div>
                <div><div style={s.metaLabel}>Auction End</div><div style={s.metaValue}>{formatTimestamp(BigInt(auction.auctionEndDate))}</div></div>
                <div><div style={s.metaLabel}>Auctioning Token</div><div style={s.tokenAddr}>{auction.auctioningToken}</div></div>
                <div><div style={s.metaLabel}>Bidding Token</div><div style={s.tokenAddr}>{auction.biddingToken}</div></div>
                <div><div style={s.metaLabel}>Protocol Fee</div><div style={s.metaValue}>{Number(FEE_NUMERATOR * 100n) / Number(FEE_DENOMINATOR)}%</div></div>
            </div>

            {/* Settlement Results */}
            {auction.isSettled && clearing && (
                <div style={s.section}>
                    <div style={sectionTitle}>Settlement Results</div>
                    <div style={s.grid}>
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

            {/* Place Bid */}
            {(auction.status === 'open' || auction.status === 'cancellation_closed') && (
                <div style={s.section}>
                    <div style={sectionTitle}>Place Bid</div>
                    <div style={s.inputRow}>
                        <div>
                            <label style={labelStyle}>Bid Amount (bidding token)</label>
                            <input style={inputStyle} value={bidSellAmount} onChange={(e) => setBidSellAmount(e.target.value)} placeholder="10.0" />
                        </div>
                        <div>
                            <label style={labelStyle}>Min Receive (auctioning token)</label>
                            <input style={inputStyle} value={bidMinBuy} onChange={(e) => setBidMinBuy(e.target.value)} placeholder="5.0" />
                        </div>
                    </div>
                    <button
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={() => void handleBid()}
                    >{busy ? 'Processing...' : 'Place Bid'}</button>
                </div>
            )}

            {/* Settle */}
            {auction.status === 'ended' && (
                <div style={s.section}>
                    <div style={sectionTitle}>Settlement</div>
                    <button
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={() => void handleSettle()}
                    >{busy ? 'Settling...' : 'Settle Auction'}</button>
                </div>
            )}

            {/* Claim */}
            {auction.isSettled && (
                <div style={s.section}>
                    <div style={sectionTitle}>Claim Tokens</div>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Order IDs (comma-separated)</label>
                        <input style={inputStyle} value={claimOrderIds} onChange={(e) => setClaimOrderIds(e.target.value)} placeholder="1, 2, 3" />
                    </div>
                    <button
                        style={{ ...btnPrimary, ...(busy || !connected ? btnDisabled : {}) }}
                        disabled={busy || !connected}
                        onClick={() => void handleClaim()}
                    >{busy ? 'Claiming...' : 'Claim'}</button>
                </div>
            )}

            {txState.status !== 'idle' && (
                <div style={statusMsg(txState.status === 'error')}>
                    {txState.message}
                    {(txState.status === 'success' || txState.status === 'error') && (
                        <button style={dismissBtn} onClick={resetTx}>dismiss</button>
                    )}
                </div>
            )}
        </div>
    );
}
