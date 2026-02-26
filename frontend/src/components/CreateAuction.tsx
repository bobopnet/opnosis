import { useState } from 'react';
import type { useOpnosis } from '../hooks/useOpnosis.js';
import { parseTokenAmount, FEE_NUMERATOR, FEE_DENOMINATOR } from '@opnosis/shared';
import {
    color, font, card, btnPrimary, btnDisabled,
    input as inputStyle, label as labelStyle, sectionTitle,
    statusMsg, dismissBtn,
} from '../styles.js';
import { TokenSelect } from './TokenSelect.js';
import { HelpTip } from './HelpTip.js';

const s = {
    container: {
        ...card,
        borderLeft: `1px solid ${color.borderSubtle}`,
        maxWidth: '720px',
    } as React.CSSProperties,
    row: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
    } as React.CSSProperties,
    field: {
        marginBottom: '16px',
    } as React.CSSProperties,
    stepRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '28px',
    } as React.CSSProperties,
    stepCircle: (active: boolean): React.CSSProperties => ({
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: font.display,
        fontSize: '13px',
        fontWeight: 700,
        background: active ? color.amber : color.bgElevated,
        color: active ? color.bgDeep : color.textMuted,
        border: active ? 'none' : `1px solid ${color.borderSubtle}`,
    }),
    stepLine: (done: boolean): React.CSSProperties => ({
        width: '40px',
        height: '2px',
        background: done ? color.amber : color.borderSubtle,
        transition: 'background 0.3s',
    }),
    stepLabel: (active: boolean): React.CSSProperties => ({
        fontFamily: font.body,
        fontSize: '14px',
        color: active ? color.textPrimary : color.textMuted,
        fontWeight: active ? 600 : 400,
    }),
    warningBox: {
        color: color.warning,
        marginBottom: '16px',
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        fontFamily: font.body,
        fontSize: '14px',
    } as React.CSSProperties,
    checkbox: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: color.textSecondary,
        fontSize: '14px',
        fontFamily: font.body,
        marginBottom: '16px',
        cursor: 'pointer',
    } as React.CSSProperties,
    feeInfo: {
        color: color.amber,
        marginBottom: '16px',
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(232, 148, 26, 0.06)',
        border: `1px solid rgba(232, 148, 26, 0.15)`,
        fontFamily: font.body,
        fontSize: '14px',
    } as React.CSSProperties,
};

interface Props {
    readonly connected: boolean;
    readonly network: string;
    readonly opnosis: ReturnType<typeof useOpnosis>;
    readonly onCreated?: () => void;
}

const feePercent = `${Number(FEE_NUMERATOR * 100n) / Number(FEE_DENOMINATOR)}%`;

export function CreateAuction({ connected, network, opnosis, onCreated }: Props) {
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
        <div style={s.container}>
            <div style={sectionTitle}>Create Auction</div>

            {/* Step indicator */}
            <div style={s.stepRow}>
                <div style={s.stepCircle(step === 'approve')}>1</div>
                <span style={s.stepLabel(step === 'approve')}>Approve</span>
                <div style={s.stepLine(step === 'create')} />
                <div style={s.stepCircle(step === 'create')}>2</div>
                <span style={s.stepLabel(step === 'create')}>Create</span>
            </div>

            {!connected && <div style={s.warningBox}>Connect wallet first</div>}

            <div style={s.feeInfo}>Protocol fee: {feePercent} of sell amount (deducted at settlement)</div>

            <div style={s.row}>
                <TokenSelect
                    label="Auctioning Token"
                    help="The OP-20 token you are selling. The total sell amount will be distributed to winning bidders."
                    value={auctioningToken}
                    onChange={setAuctioningToken}
                    network={network}
                />
                <TokenSelect
                    label="Bidding Token"
                    help="The OP-20 token bidders use to place bids. You receive this token from winning bids."
                    value={biddingToken}
                    onChange={setBiddingToken}
                    network={network}
                />
            </div>
            <div style={s.row}>
                <div style={s.field}>
                    <label style={labelStyle}>Sell Amount<HelpTip text="Total number of tokens you are putting up for auction." /></label>
                    <input style={inputStyle} value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} placeholder="100.0" />
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Min Buy Amount<HelpTip text="Minimum total bidding tokens you will accept for the entire sell amount. Sets the reserve price." /></label>
                    <input style={inputStyle} value={minBuyAmount} onChange={(e) => setMinBuyAmount(e.target.value)} placeholder="50.0" />
                </div>
            </div>
            <div style={s.row}>
                <div style={s.field}>
                    <label style={labelStyle}>Min Bid Per Order<HelpTip text="Smallest bid a single bidder can place. Prevents dust bids. 0 = no minimum." /></label>
                    <input style={inputStyle} value={minBidPerOrder} onChange={(e) => setMinBidPerOrder(e.target.value)} placeholder="0.1" />
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Min Funding Threshold<HelpTip text="Minimum number of bidding tokens the auctioneer expects to receive. If not met, the auction fails and all tokens are returned. 0 = disabled." /></label>
                    <input style={inputStyle} value={minFunding} onChange={(e) => setMinFunding(e.target.value)} placeholder="0" />
                </div>
            </div>
            <div style={s.row}>
                <div style={s.field}>
                    <label style={labelStyle}>Cancel Window (minutes)<HelpTip text="Minutes from now during which bidders can cancel orders. After this, all bids are final." /></label>
                    <input style={inputStyle} type="number" value={cancellationMinutes} onChange={(e) => setCancellationMinutes(e.target.value)} />
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Auction Duration (minutes)<HelpTip text="Minutes from now the auction accepts bids. After this, the auction can be settled." /></label>
                    <input style={inputStyle} type="number" value={auctionMinutes} onChange={(e) => setAuctionMinutes(e.target.value)} />
                </div>
            </div>
            <label style={s.checkbox}>
                <input type="checkbox" checked={atomicClose} onChange={(e) => setAtomicClose(e.target.checked)} />
                Allow atomic closure
                <HelpTip text="When enabled, anyone can settle the auction immediately once enough bids clear the reserve price, without waiting for the end time." />
            </label>

            {step === 'approve' ? (
                <button
                    style={{ ...btnPrimary, width: '100%', ...(busy || !connected ? btnDisabled : {}) }}
                    disabled={busy || !connected}
                    onClick={() => void handleApprove()}
                >
                    {busy ? 'Approving...' : 'Approve Token'}
                </button>
            ) : (
                <button
                    style={{ ...btnPrimary, width: '100%', ...(busy || !connected ? btnDisabled : {}) }}
                    disabled={busy || !connected}
                    onClick={() => void handleCreate()}
                >
                    {busy ? 'Creating...' : 'Create Auction'}
                </button>
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
