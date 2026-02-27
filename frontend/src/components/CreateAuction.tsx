import { useState, useEffect } from 'react';
import type { useOpnosis } from '../hooks/useOpnosis.js';
import { parseTokenAmount, FEE_NUMERATOR, FEE_DENOMINATOR, KNOWN_TOKENS } from '@opnosis/shared';
import { API_BASE_URL } from '../constants.js';
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
    const [reservePriceUsd, setReservePriceUsd] = useState('');
    const [minBidPerOrder, setMinBidPerOrder] = useState('0');
    const [minFunding, setMinFunding] = useState('0');
    const [startMode, setStartMode] = useState<'now' | 'schedule'>('now');
    const [scheduledStart, setScheduledStart] = useState('');
    const [cancelDays, setCancelDays] = useState('0');
    const [cancelHours, setCancelHours] = useState('0');
    const [auctionDays, setAuctionDays] = useState('1');
    const [auctionHours, setAuctionHours] = useState('0');
    const [atomicClose, setAtomicClose] = useState(false);
    const [step, setStep] = useState<'approve' | 'create'>('approve');
    const [biddingTokenUsdPrice, setBiddingTokenUsdPrice] = useState<number | null>(null);

    useEffect(() => {
        setBiddingTokenUsdPrice(null);
        if (!biddingToken) return;
        let cancelled = false;
        async function loadPrice() {
            try {
                const res = await fetch(`${API_BASE_URL}/price/${biddingToken}`);
                if (!res.ok) return;
                const data = await res.json() as { usd: number };
                if (!cancelled && data.usd > 0) setBiddingTokenUsdPrice(data.usd);
            } catch {
                // price unavailable
            }
        }
        void loadPrice();
        return () => { cancelled = true; };
    }, [biddingToken]);

    const auctioningTokenSymbol = KNOWN_TOKENS.find((t) =>
        (network === 'mainnet' ? t.mainnet : t.testnet) === auctioningToken,
    )?.symbol ?? '';

    const biddingTokenSymbol = KNOWN_TOKENS.find((t) =>
        (network === 'mainnet' ? t.mainnet : t.testnet) === biddingToken,
    )?.symbol ?? '';

    // Compute minBuyAmount in bidding tokens from USD reserve price
    const computedMinBuyTokens = (() => {
        const price = parseFloat(reservePriceUsd);
        const sell = parseFloat(sellAmount);
        if (!price || !sell || price <= 0 || sell <= 0 || biddingTokenUsdPrice === null || biddingTokenUsdPrice <= 0) return null;
        return (price * sell) / biddingTokenUsdPrice;
    })();

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
            minBuyAmount: computedMinBuyTokens !== null ? parseTokenAmount(computedMinBuyTokens.toFixed(8)) : 0n,
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
                    help="The token you want to sell. Winning bidders will receive this token proportional to their bids."
                    value={auctioningToken}
                    onChange={setAuctioningToken}
                    network={network}
                    excludeBiddingOnly
                />
                <TokenSelect
                    label="Bidding Token"
                    help="The token bidders must use to participate. You will receive this token as payment from winning bids."
                    value={biddingToken}
                    onChange={setBiddingToken}
                    network={network}
                />
            </div>
            <div style={s.row}>
                <div style={s.field}>
                    <label style={labelStyle}>Total Auctioned Tokens{auctioningTokenSymbol ? ` (${auctioningTokenSymbol})` : ''}<HelpTip text="The total number of tokens to be distributed to winning bidders." /></label>
                    <input style={inputStyle} value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} placeholder="100.0" />
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Reserve Price per Token (USD)<HelpTip text="The lowest USD price per token you are willing to accept. Bids below this price will not be filled. The equivalent amount in bidding tokens is calculated automatically." /></label>
                    <input style={inputStyle} value={reservePriceUsd} onChange={(e) => setReservePriceUsd(e.target.value)} placeholder="0.05" />
                    {computedMinBuyTokens !== null && (
                        <span style={{ color: color.textMuted, fontSize: '13px', fontFamily: font.body, marginTop: '4px', display: 'inline-block' }}>
                            = {computedMinBuyTokens.toFixed(4)} {biddingTokenSymbol} total min buy
                        </span>
                    )}
                </div>
            </div>
            <div style={s.row}>
                <div style={s.field}>
                    <label style={labelStyle}>Min Bid Per Order{biddingTokenSymbol ? ` (${biddingTokenSymbol})` : ''}<HelpTip text="The minimum amount of bidding tokens a single bid must contain. Prevents spam and dust bids. Set to 0 to allow any amount." /></label>
                    <input style={inputStyle} value={minBidPerOrder} onChange={(e) => setMinBidPerOrder(e.target.value)} placeholder="0.1" />
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Min Funding Threshold{biddingTokenSymbol ? ` (${biddingTokenSymbol})` : ''}<HelpTip text="The minimum total amount of bidding tokens that must be raised for the auction to succeed. If total bids fall below this threshold, the auction is cancelled and all tokens are returned to their owners. Set to 0 to disable." /></label>
                    <input style={inputStyle} value={minFunding} onChange={(e) => setMinFunding(e.target.value)} placeholder="0" />
                    {(() => {
                        const val = parseFloat(minFunding);
                        if (!val || val <= 0 || biddingTokenUsdPrice === null) return null;
                        return <span style={{ color: color.textMuted, fontSize: '13px', fontFamily: font.body, marginTop: '4px', display: 'inline-block' }}>(${(val * biddingTokenUsdPrice).toFixed(2)} USD)</span>;
                    })()}
                </div>
            </div>
            <div style={s.field}>
                <label style={labelStyle}>Start Mode<HelpTip text="Controls when bidders can begin placing bids. 'Start Now' opens bidding as soon as the auction is created. 'Schedule Start' delays bidding until a specific date and time." /></label>
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
                    <label style={labelStyle}>Cancel Window (optional)<HelpTip text={startMode === 'schedule' ? 'How long after the scheduled start bidders are allowed to cancel their bids. Once this window closes, all placed bids are locked in and cannot be withdrawn.' : 'How long from now bidders are allowed to cancel their bids. Once this window closes, all placed bids are locked in and cannot be withdrawn.'} /></label>
                    <div style={s.dualInput}>
                        <input style={s.shortInput} type="number" min="0" value={cancelDays} onChange={(e) => setCancelDays(e.target.value)} />
                        <span style={s.unitLabel}>days</span>
                        <input style={s.shortInput} type="number" min="0" max="23" value={cancelHours} onChange={(e) => setCancelHours(e.target.value)} />
                        <span style={s.unitLabel}>hours</span>
                    </div>
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Auction Duration<HelpTip text={startMode === 'schedule' ? 'How long the auction runs after the scheduled start. No new bids can be placed after this period ends, and the auction becomes eligible for settlement.' : 'How long the auction runs from now. No new bids can be placed after this period ends, and the auction becomes eligible for settlement.'} /></label>
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
                <HelpTip text="When enabled, the auctioneer can settle the auction early once the min funding threshold is met. Useful for fast fundraises, but may reduce price discovery by cutting off later bids. When disabled, the auction runs for the full duration, maximizing participation and price discovery." />
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
