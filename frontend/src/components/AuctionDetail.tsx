import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount, formatTimestamp, formatPrice, parseTokenAmount } from '@opnosis/shared';
import type { IndexedAuction, IndexedClearing } from '../types.js';
import type { useOpnosis } from '../hooks/useOpnosis.js';

const styles = {
    container: { background: '#1e1e2e', borderRadius: '12px', padding: '24px', border: '1px solid #2d2d3f' } as const,
    back: { background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', marginBottom: '16px', fontSize: '14px' } as const,
    title: { fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px' } as const,
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' } as const,
    label: { color: '#9ca3af', fontSize: '12px' } as const,
    value: { color: '#e2e8f0', fontSize: '14px' } as const,
    section: { marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #2d2d3f' } as const,
    input: {
        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #374151',
        background: '#0f0f1e', color: '#e2e8f0', fontSize: '14px', outline: 'none',
    } as const,
    btn: {
        padding: '10px 20px', borderRadius: '8px', border: 'none',
        background: '#6366f1', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    } as const,
    disabled: { opacity: 0.5, cursor: 'not-allowed' } as const,
    status: (isError: boolean) => ({
        marginTop: '12px', padding: '10px', borderRadius: '6px', fontSize: '13px',
        background: isError ? '#1c0d0d' : '#0d1c1c',
        color: isError ? '#ef4444' : '#10b981',
    }) as const,
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

    if (loading) return <div style={{ color: '#9ca3af', padding: '40px', textAlign: 'center' }}>Loading...</div>;
    if (!auction) return <div style={{ color: '#ef4444', padding: '40px', textAlign: 'center' }}>Auction not found</div>;

    const handleBid = async () => {
        if (!bidSellAmount || !bidMinBuy) return;
        // First approve bidding token — only proceed to place orders on success
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
        const ids = claimOrderIds.split(',').map((s) => BigInt(s.trim())).filter((n) => n > 0n);
        if (ids.length === 0) return;
        const ok = await claimOrders(BigInt(auction.id), ids);
        if (ok) refresh();
    };

    return (
        <div style={styles.container}>
            <button style={styles.back} onClick={onBack}>← Back to auctions</button>
            <div style={styles.title}>Auction #{auction.id}</div>

            <div style={styles.grid}>
                <div><div style={styles.label}>Status</div><div style={styles.value}>{auction.status}</div></div>
                <div><div style={styles.label}>Orders</div><div style={styles.value}>{auction.orderCount} / 100</div></div>
                <div><div style={styles.label}>Sell Amount</div><div style={styles.value}>{formatTokenAmount(BigInt(auction.auctionedSellAmount))}</div></div>
                <div><div style={styles.label}>Min Buy Amount</div><div style={styles.value}>{formatTokenAmount(BigInt(auction.minBuyAmount))}</div></div>
                <div><div style={styles.label}>Cancel Deadline</div><div style={styles.value}>{formatTimestamp(BigInt(auction.cancellationEndDate))}</div></div>
                <div><div style={styles.label}>Auction End</div><div style={styles.value}>{formatTimestamp(BigInt(auction.auctionEndDate))}</div></div>
                <div><div style={styles.label}>Auctioning Token</div><div style={{ ...styles.value, fontSize: '11px', wordBreak: 'break-all' }}>{auction.auctioningToken}</div></div>
                <div><div style={styles.label}>Bidding Token</div><div style={{ ...styles.value, fontSize: '11px', wordBreak: 'break-all' }}>{auction.biddingToken}</div></div>
            </div>

            {/* Settlement Results */}
            {auction.isSettled && clearing && (
                <div style={styles.section}>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>Settlement Results</div>
                    <div style={styles.grid}>
                        <div><div style={styles.label}>Clearing Buy Amount</div><div style={styles.value}>{formatTokenAmount(BigInt(clearing.clearingBuyAmount))}</div></div>
                        <div><div style={styles.label}>Clearing Sell Amount</div><div style={styles.value}>{formatTokenAmount(BigInt(clearing.clearingSellAmount))}</div></div>
                        <div><div style={styles.label}>Clearing Price</div><div style={styles.value}>{formatPrice(BigInt(clearing.clearingSellAmount), BigInt(clearing.clearingBuyAmount))}</div></div>
                    </div>
                </div>
            )}

            {/* Place Bid Section */}
            {(auction.status === 'open' || auction.status === 'cancellation_closed') && (
                <div style={styles.section}>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>Place Bid</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                            <label style={styles.label}>Bid Amount (bidding token)</label>
                            <input style={styles.input} value={bidSellAmount} onChange={(e) => setBidSellAmount(e.target.value)} placeholder="10.0" />
                        </div>
                        <div>
                            <label style={styles.label}>Min Receive (auctioning token)</label>
                            <input style={styles.input} value={bidMinBuy} onChange={(e) => setBidMinBuy(e.target.value)} placeholder="5.0" />
                        </div>
                    </div>
                    <button
                        style={{ ...styles.btn, ...(busy || !connected ? styles.disabled : {}) }}
                        disabled={busy || !connected}
                        onClick={() => void handleBid()}
                    >{busy ? 'Processing...' : 'Place Bid'}</button>
                </div>
            )}

            {/* Settle Section */}
            {auction.status === 'ended' && (
                <div style={styles.section}>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>Settlement</div>
                    <button
                        style={{ ...styles.btn, ...(busy || !connected ? styles.disabled : {}) }}
                        disabled={busy || !connected}
                        onClick={() => void handleSettle()}
                    >{busy ? 'Settling...' : 'Settle Auction'}</button>
                </div>
            )}

            {/* Claim Section */}
            {auction.isSettled && (
                <div style={styles.section}>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>Claim Tokens</div>
                    <div style={{ marginBottom: '12px' }}>
                        <label style={styles.label}>Order IDs (comma-separated)</label>
                        <input style={styles.input} value={claimOrderIds} onChange={(e) => setClaimOrderIds(e.target.value)} placeholder="1, 2, 3" />
                    </div>
                    <button
                        style={{ ...styles.btn, ...(busy || !connected ? styles.disabled : {}) }}
                        disabled={busy || !connected}
                        onClick={() => void handleClaim()}
                    >{busy ? 'Claiming...' : 'Claim'}</button>
                </div>
            )}

            {txState.status !== 'idle' && (
                <div style={styles.status(txState.status === 'error')}>
                    {txState.message}
                    {(txState.status === 'success' || txState.status === 'error') && (
                        <button
                            style={{ marginLeft: '12px', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={resetTx}
                        >dismiss</button>
                    )}
                </div>
            )}
        </div>
    );
}
