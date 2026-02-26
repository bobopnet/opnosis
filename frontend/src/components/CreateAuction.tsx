import { useState } from 'react';
import type { useOpnosis } from '../hooks/useOpnosis.js';
import { parseTokenAmount } from '@opnosis/shared';

const formStyles = {
    container: { background: '#1e1e2e', borderRadius: '12px', padding: '24px', border: '1px solid #2d2d3f' } as const,
    title: { fontSize: '18px', fontWeight: 600, color: '#fff', marginBottom: '16px' } as const,
    field: { marginBottom: '12px' } as const,
    label: { display: 'block', color: '#9ca3af', fontSize: '12px', marginBottom: '4px' } as const,
    input: {
        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #374151',
        background: '#0f0f1e', color: '#e2e8f0', fontSize: '14px', outline: 'none',
    } as const,
    row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } as const,
    btn: {
        width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
        background: '#6366f1', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
        marginTop: '8px',
    } as const,
    disabled: { opacity: 0.5, cursor: 'not-allowed' } as const,
    status: (isError: boolean) => ({
        marginTop: '12px', padding: '10px', borderRadius: '6px', fontSize: '13px',
        background: isError ? '#1c0d0d' : '#0d1c1c',
        color: isError ? '#ef4444' : '#10b981',
    }) as const,
};

interface Props {
    readonly connected: boolean;
    readonly opnosis: ReturnType<typeof useOpnosis>;
    readonly onCreated?: () => void;
}

export function CreateAuction({ connected, opnosis, onCreated }: Props) {
    const [auctioningToken, setAuctioningToken] = useState('');
    const [biddingToken, setBiddingToken] = useState('');
    const [sellAmount, setSellAmount] = useState('');
    const [minBuyAmount, setMinBuyAmount] = useState('');
    const [minBidPerOrder, setMinBidPerOrder] = useState('');
    const [minFunding, setMinFunding] = useState('0');
    const [cancellationMinutes, setCancellationMinutes] = useState('60');
    const [auctionMinutes, setAuctionMinutes] = useState('120');
    const [atomicClose, setAtomicClose] = useState(false);
    const [step, setStep] = useState<'approve' | 'create'>('approve');

    const { txState, resetTx, createAuction, approveToken } = opnosis;

    const handleApprove = async () => {
        if (!sellAmount || !auctioningToken) return;
        const ok = await approveToken(auctioningToken, parseTokenAmount(sellAmount));
        if (ok) setStep('create');
    };

    const handleCreate = async () => {
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        const ok = await createAuction({
            auctioningToken,
            biddingToken,
            cancellationEndDate: nowSec + BigInt(parseInt(cancellationMinutes, 10)) * 60n,
            auctionEndDate: nowSec + BigInt(parseInt(auctionMinutes, 10)) * 60n,
            auctionedSellAmount: parseTokenAmount(sellAmount),
            minBuyAmount: parseTokenAmount(minBuyAmount),
            minimumBiddingAmountPerOrder: parseTokenAmount(minBidPerOrder || '0'),
            minFundingThreshold: parseTokenAmount(minFunding),
            isAtomicClosureAllowed: atomicClose,
        });
        if (ok) onCreated?.();
    };

    const busy = txState.status === 'pending';

    return (
        <div style={formStyles.container}>
            <div style={formStyles.title}>Create Auction</div>
            {!connected && <div style={{ color: '#f59e0b', marginBottom: '12px' }}>Connect wallet first</div>}

            <div style={formStyles.row}>
                <div style={formStyles.field}>
                    <label style={formStyles.label}>Auctioning Token Address</label>
                    <input style={formStyles.input} value={auctioningToken} onChange={(e) => setAuctioningToken(e.target.value)} placeholder="0x..." />
                </div>
                <div style={formStyles.field}>
                    <label style={formStyles.label}>Bidding Token Address</label>
                    <input style={formStyles.input} value={biddingToken} onChange={(e) => setBiddingToken(e.target.value)} placeholder="0x..." />
                </div>
            </div>
            <div style={formStyles.row}>
                <div style={formStyles.field}>
                    <label style={formStyles.label}>Sell Amount</label>
                    <input style={formStyles.input} value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} placeholder="100.0" />
                </div>
                <div style={formStyles.field}>
                    <label style={formStyles.label}>Min Buy Amount</label>
                    <input style={formStyles.input} value={minBuyAmount} onChange={(e) => setMinBuyAmount(e.target.value)} placeholder="50.0" />
                </div>
            </div>
            <div style={formStyles.row}>
                <div style={formStyles.field}>
                    <label style={formStyles.label}>Min Bid Per Order</label>
                    <input style={formStyles.input} value={minBidPerOrder} onChange={(e) => setMinBidPerOrder(e.target.value)} placeholder="0.1" />
                </div>
                <div style={formStyles.field}>
                    <label style={formStyles.label}>Min Funding Threshold</label>
                    <input style={formStyles.input} value={minFunding} onChange={(e) => setMinFunding(e.target.value)} placeholder="0" />
                </div>
            </div>
            <div style={formStyles.row}>
                <div style={formStyles.field}>
                    <label style={formStyles.label}>Cancel Window (minutes)</label>
                    <input style={formStyles.input} type="number" value={cancellationMinutes} onChange={(e) => setCancellationMinutes(e.target.value)} />
                </div>
                <div style={formStyles.field}>
                    <label style={formStyles.label}>Auction Duration (minutes)</label>
                    <input style={formStyles.input} type="number" value={auctionMinutes} onChange={(e) => setAuctionMinutes(e.target.value)} />
                </div>
            </div>
            <div style={formStyles.field}>
                <label style={{ ...formStyles.label, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={atomicClose} onChange={(e) => setAtomicClose(e.target.checked)} />
                    Allow atomic closure
                </label>
            </div>

            {step === 'approve' ? (
                <button
                    style={{ ...formStyles.btn, ...(busy || !connected ? formStyles.disabled : {}) }}
                    disabled={busy || !connected}
                    onClick={() => void handleApprove()}
                >
                    {busy ? 'Approving...' : 'Approve Token'}
                </button>
            ) : (
                <button
                    style={{ ...formStyles.btn, ...(busy || !connected ? formStyles.disabled : {}) }}
                    disabled={busy || !connected}
                    onClick={() => void handleCreate()}
                >
                    {busy ? 'Creating...' : 'Create Auction'}
                </button>
            )}

            {txState.status !== 'idle' && (
                <div style={formStyles.status(txState.status === 'error')}>
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
