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
        margin: '0 auto',
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
        color: active ? color.bgDeep : color.textSecondary,
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
        color: active ? color.textPrimary : color.textSecondary,
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
        fontSize: '15px',
    } as React.CSSProperties,
    checkbox: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: color.textSecondary,
        fontSize: '15px',
        fontFamily: font.body,
        marginBottom: '16px',
        cursor: 'pointer',
    } as React.CSSProperties,
    dualInput: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    } as React.CSSProperties,
    shortInput: {
        ...inputStyle,
        width: '56px',
        textAlign: 'center' as const,
    } as React.CSSProperties,
    unitLabel: {
        fontFamily: font.body,
        fontSize: '14px',
        color: color.textSecondary,
    } as React.CSSProperties,
    feeInfo: {
        color: color.amber,
        marginBottom: '16px',
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(232, 148, 26, 0.06)',
        border: `1px solid rgba(232, 148, 26, 0.15)`,
        fontFamily: font.body,
        fontSize: '15px',
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
    const [sellAmount, setSellAmount] = useState('0');
    const [minBuyAmount, setMinBuyAmount] = useState('0');
    const [minBidPerOrder, setMinBidPerOrder] = useState('0');
    const [minFunding, setMinFunding] = useState('0');
    const [startMode, setStartMode] = useState<'now' | 'schedule'>('now');
    const [scheduledStart, setScheduledStart] = useState('');
    const [cancelDays, setCancelDays] = useState('0');
    const [cancelHours, setCancelHours] = useState('1');
    const [auctionDays, setAuctionDays] = useState('1');
    const [auctionHours, setAuctionHours] = useState('0');
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
        const cancelSec = BigInt(parseInt(cancelDays, 10) || 0) * 86400n + BigInt(parseInt(cancelHours, 10) || 0) * 3600n;
        const auctionSec = BigInt(parseInt(auctionDays, 10) || 0) * 86400n + BigInt(parseInt(auctionHours, 10) || 0) * 3600n;

        let orderPlacementStartDate = 0n;
        let baseTime = nowSec;
        if (startMode === 'schedule' && scheduledStart) {
            const startTs = BigInt(Math.floor(new Date(scheduledStart).getTime() / 1000));
            orderPlacementStartDate = startTs;
            baseTime = startTs;
        }

        const ok = await createAuction({
            auctioningToken,
            biddingToken,
            orderPlacementStartDate,
            cancellationEndDate: baseTime + cancelSec,
            auctionEndDate: baseTime + auctionSec,
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
                    excludeBiddingOnly
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
            <div style={s.field}>
                <label style={labelStyle}>Start Mode<HelpTip text="Choose when bidding opens. 'Start Now' opens bidding immediately. 'Schedule Start' lets you set a future date." /></label>
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                    <label style={s.checkbox}>
                        <input type="radio" name="startMode" checked={startMode === 'now'} onChange={() => setStartMode('now')} />
                        Start Now
                    </label>
                    <label style={s.checkbox}>
                        <input type="radio" name="startMode" checked={startMode === 'schedule'} onChange={() => setStartMode('schedule')} />
                        Schedule Start
                    </label>
                </div>
                {startMode === 'schedule' && (
                    <input
                        style={{ ...inputStyle, colorScheme: 'dark' }}
                        type="datetime-local"
                        value={scheduledStart}
                        onChange={(e) => setScheduledStart(e.target.value)}
                    />
                )}
            </div>
            <div style={s.row}>
                <div style={s.field}>
                    <label style={labelStyle}>Cancel Window<HelpTip text={startMode === 'schedule' ? 'Time from scheduled start during which bidders can cancel orders.' : 'Time from now during which bidders can cancel orders. After this, all bids are final.'} /></label>
                    <div style={s.dualInput}>
                        <input style={s.shortInput} type="number" min="0" value={cancelDays} onChange={(e) => setCancelDays(e.target.value)} />
                        <span style={s.unitLabel}>days</span>
                        <input style={s.shortInput} type="number" min="0" max="23" value={cancelHours} onChange={(e) => setCancelHours(e.target.value)} />
                        <span style={s.unitLabel}>hours</span>
                    </div>
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Auction Duration<HelpTip text={startMode === 'schedule' ? 'Time from scheduled start the auction accepts bids.' : 'Time from now the auction accepts bids. After this, the auction can be settled.'} /></label>
                    <div style={s.dualInput}>
                        <input style={s.shortInput} type="number" min="0" value={auctionDays} onChange={(e) => setAuctionDays(e.target.value)} />
                        <span style={s.unitLabel}>days</span>
                        <input style={s.shortInput} type="number" min="0" max="23" value={auctionHours} onChange={(e) => setAuctionHours(e.target.value)} />
                        <span style={s.unitLabel}>hours</span>
                    </div>
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
