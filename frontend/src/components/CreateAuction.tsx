import { useState, useEffect } from 'react';
import type { useOpnosis } from '../hooks/useOpnosis.js';
import type { IndexedAuction } from '../types.js';
import { parseTokenAmount, FEE_NUMERATOR, FEE_DENOMINATOR, KNOWN_TOKENS, TOKEN_DECIMALS } from '@opnosis/shared';
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
    readonly onCreated?: (auctionData?: Partial<IndexedAuction>) => void;
}

const feePercent = `${Number(FEE_NUMERATOR * 100n) / Number(FEE_DENOMINATOR)}%`;

export function CreateAuction({ connected, network, opnosis, onCreated }: Props) {
    const [auctioningToken, setAuctioningToken] = useState('');
    const [biddingToken, setBiddingToken] = useState('');
    const [sellAmount, setSellAmount] = useState('0');
    const [reservePriceUsd, setReservePriceUsd] = useState('0');
    const [minReceiveBidding, setMinReceiveBidding] = useState('0');
    const [minReceiveUsd, setMinReceiveUsd] = useState('0');
    const [minBidPerOrder, setMinBidPerOrder] = useState('0');
    const [minFunding, setMinFunding] = useState('0');
    const [minFundingUsd, setMinFundingUsd] = useState('0');
    const [startMode, setStartMode] = useState<'now' | 'schedule'>('now');
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('12:00');
    const [scheduledAmPm, setScheduledAmPm] = useState<'AM' | 'PM'>('AM');
    const [cancelDays, setCancelDays] = useState('0');
    const [cancelHours, setCancelHours] = useState('0');
    const [cancelMinutes, setCancelMinutes] = useState('0');
    const [auctionDays, setAuctionDays] = useState('0');
    const [auctionHours, setAuctionHours] = useState('0');
    const [auctionMinutes, setAuctionMinutes] = useState('0');
    const atomicClose = true; // Always enabled — auctioneer can settle early when min funding met
    const [step, setStep] = useState<'ready' | 'approving' | 'creating'>('ready');
    const [biddingTokenUsdPrice, setBiddingTokenUsdPrice] = useState<number | null>(null);
    const [customAuctioningSymbol, setCustomAuctioningSymbol] = useState('');
    const [customBiddingSymbol, setCustomBiddingSymbol] = useState('');

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
    )?.symbol ?? customAuctioningSymbol;

    const biddingTokenSymbol = KNOWN_TOKENS.find((t) =>
        (network === 'mainnet' ? t.mainnet : t.testnet) === biddingToken,
    )?.symbol ?? customBiddingSymbol;

    const auctioningDecimals = KNOWN_TOKENS.find((t) =>
        (network === 'mainnet' ? t.mainnet : t.testnet) === auctioningToken,
    )?.decimals ?? TOKEN_DECIMALS;

    const biddingDecimals = KNOWN_TOKENS.find((t) =>
        (network === 'mainnet' ? t.mainnet : t.testnet) === biddingToken,
    )?.decimals ?? TOKEN_DECIMALS;

    const canCompute = biddingTokenUsdPrice !== null && biddingTokenUsdPrice > 0;

    const onReservePriceChange = (val: string) => {
        setReservePriceUsd(val);
        if (!canCompute) return;
        const price = parseFloat(val);
        const sell = parseFloat(sellAmount);
        if (price > 0 && sell > 0) {
            const tokens = Math.floor((price * sell) / biddingTokenUsdPrice!);
            setMinReceiveBidding(tokens.toString());
            setMinReceiveUsd((tokens * biddingTokenUsdPrice!).toFixed(2).replace(/\.?0+$/, ''));
        }
    };

    const onMinReceiveTokenChange = (val: string) => {
        setMinReceiveBidding(val);
        if (!canCompute) return;
        const minRcv = parseFloat(val);
        const sell = parseFloat(sellAmount);
        if (minRcv > 0) {
            setMinReceiveUsd((minRcv * biddingTokenUsdPrice!).toFixed(2).replace(/\.?0+$/, ''));
        } else {
            setMinReceiveUsd('0');
        }
        if (minRcv > 0 && sell > 0) {
            setReservePriceUsd(((minRcv * biddingTokenUsdPrice!) / sell).toFixed(8).replace(/\.?0+$/, ''));
        }
    };

    const onMinReceiveUsdChange = (val: string) => {
        setMinReceiveUsd(val);
        if (!canCompute) return;
        const usd = parseFloat(val);
        if (usd > 0) {
            const tokens = Math.floor(usd / biddingTokenUsdPrice!);
            setMinReceiveBidding(tokens.toString());
            const sell = parseFloat(sellAmount);
            if (sell > 0) {
                setReservePriceUsd((usd / sell).toFixed(8).replace(/\.?0+$/, ''));
            }
        } else {
            setMinReceiveBidding('0');
        }
    };

    const onSellAmountChange = (val: string) => {
        setSellAmount(val);
        // Recompute min receive from existing reserve price
        if (!canCompute) return;
        const price = parseFloat(reservePriceUsd);
        const sell = parseFloat(val);
        if (price > 0 && sell > 0) {
            const tokens = Math.floor((price * sell) / biddingTokenUsdPrice!);
            setMinReceiveBidding(tokens.toString());
            setMinReceiveUsd((tokens * biddingTokenUsdPrice!).toFixed(2).replace(/\.?0+$/, ''));
        }
    };

    const onMinFundingUsdChange = (val: string) => {
        setMinFundingUsd(val);
        if (!canCompute) return;
        const usd = parseFloat(val);
        if (usd > 0) {
            setMinFunding((usd / biddingTokenUsdPrice!).toFixed(8).replace(/\.?0+$/, ''));
        } else {
            setMinFunding('0');
        }
    };

    const onMinFundingTokenChange = (val: string) => {
        setMinFunding(val);
        if (!canCompute) return;
        const tokens = parseFloat(val);
        if (tokens > 0) {
            setMinFundingUsd((tokens * biddingTokenUsdPrice!).toFixed(2).replace(/\.?0+$/, ''));
        } else {
            setMinFundingUsd('0');
        }
    };

    const { txState, resetTx, createAuction, approveToken } = opnosis;

    const handleCreateAuction = async () => {
        if (!sellAmount || !auctioningToken) return;

        // Step 1: Approve (sellAmount + 0.3% fee deposit)
        setStep('approving');
        const sellBase = parseTokenAmount(sellAmount, auctioningDecimals);
        const feeDeposit = sellBase * FEE_NUMERATOR / FEE_DENOMINATOR;
        const approved = await approveToken(auctioningToken, sellBase + feeDeposit);
        if (!approved) { setStep('ready'); return; }

        // Step 2: Create
        // OPNet uses millisecond timestamps (Blockchain.block.medianTimestamp is ms).
        // Blockchain time can be hours ahead of wall clock — fetch it from the backend.
        setStep('creating');
        let nowMs = BigInt(Date.now());
        try {
            const btRes = await fetch(`${API_BASE_URL}/blocktime`);
            if (btRes.ok) {
                const btData = await btRes.json() as { blockTimeMs: string };
                const bt = BigInt(btData.blockTimeMs);
                if (bt > nowMs) nowMs = bt;
            }
        } catch { /* fall back to Date.now() */ }
        const cancelMs = (BigInt(parseInt(cancelDays, 10) || 0) * 86400n + BigInt(parseInt(cancelHours, 10) || 0) * 3600n + BigInt(parseInt(cancelMinutes, 10) || 0) * 60n) * 1000n;
        const auctionMs = (BigInt(parseInt(auctionDays, 10) || 0) * 86400n + BigInt(parseInt(auctionHours, 10) || 0) * 3600n + BigInt(parseInt(auctionMinutes, 10) || 0) * 60n) * 1000n;

        let orderPlacementStartDate = 0n;
        let baseTime = nowMs;
        if (startMode === 'schedule' && scheduledTime) {
            const dateStr = scheduledDate || new Date().toISOString().split('T')[0];
            const [hStr, mStr] = scheduledTime.split(':');
            let hour = parseInt(hStr, 10) || 0;
            if (scheduledAmPm === 'PM' && hour < 12) hour += 12;
            if (scheduledAmPm === 'AM' && hour === 12) hour = 0;
            const h24 = hour.toString().padStart(2, '0');
            const min = (mStr || '00').padStart(2, '0');
            const startTs = BigInt(new Date(`${dateStr}T${h24}:${min}`).getTime());
            orderPlacementStartDate = startTs;
            baseTime = startTs;
        }

        const ok = await createAuction({
            auctioningToken,
            biddingToken,
            orderPlacementStartDate,
            cancellationEndDate: baseTime + cancelMs,
            auctionEndDate: baseTime + auctionMs,
            auctionedSellAmount: parseTokenAmount(sellAmount, auctioningDecimals),
            minBuyAmount: parseTokenAmount(minReceiveBidding || '0', biddingDecimals),
            minimumBiddingAmountPerOrder: parseTokenAmount(minBidPerOrder || '0', biddingDecimals),
            minFundingThreshold: parseTokenAmount(minFunding, biddingDecimals),
            isAtomicClosureAllowed: atomicClose,
        });
        if (ok) onCreated?.({
            id: 'pending',
            auctioningToken,
            auctioningTokenName: auctioningTokenSymbol || 'New Auction',
            auctioningTokenSymbol: auctioningTokenSymbol || '',
            biddingToken,
            biddingTokenName: biddingTokenSymbol || '',
            biddingTokenSymbol: biddingTokenSymbol || '',
            auctionedSellAmount: parseTokenAmount(sellAmount, auctioningDecimals).toString(),
            auctioningTokenDecimals: auctioningDecimals,
            biddingTokenDecimals: biddingDecimals,
            orderPlacementStartDate: orderPlacementStartDate.toString(),
            auctionEndDate: (baseTime + auctionMs).toString(),
            minFundingThreshold: parseTokenAmount(minFunding, biddingDecimals).toString(),
        } as Partial<IndexedAuction>);
        setStep('ready');
    };

    const busy = txState.status === 'pending';

    return (
        <div style={s.container}>
            <div style={sectionTitle}>Create Auction</div>

            {/* Step indicator */}
            {step !== 'ready' && (
                <div style={s.stepRow}>
                    <div style={s.stepCircle(step === 'approving')}>1</div>
                    <span style={s.stepLabel(step === 'approving')}>Approve</span>
                    <div style={s.stepLine(step === 'creating')} />
                    <div style={s.stepCircle(step === 'creating')}>2</div>
                    <span style={s.stepLabel(step === 'creating')}>Create</span>
                </div>
            )}

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
                    onSymbolResolved={setCustomAuctioningSymbol}
                />
                <TokenSelect
                    label="Bidding Token"
                    help="The token bidders must use to participate. You will receive this token as payment from winning bids."
                    value={biddingToken}
                    onChange={setBiddingToken}
                    network={network}
                    onSymbolResolved={setCustomBiddingSymbol}
                />
            </div>
            <div style={s.row}>
                <div style={s.field}>
                    <label style={labelStyle}>Total Auction Tokens{auctioningTokenSymbol ? ` (${auctioningTokenSymbol})` : ''}<HelpTip text="The total number of tokens to be distributed to winning bidders." /></label>
                    <input style={inputStyle} inputMode="decimal" value={sellAmount} onChange={(e) => onSellAmountChange(e.target.value.replace(/[^0-9.]/g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!sellAmount) setSellAmount('0'); }} placeholder="0" />
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Min Funding Threshold<HelpTip text="The minimum total amount that must be raised for the auction to succeed. If the total bid amount does not reach this threshold, the auction is cancelled and all tokens are returned to their owners. Set to 0 for no minimum — the auction will succeed regardless of how much is raised." /></label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative' as const }}>
                            <input style={{ ...inputStyle, paddingRight: biddingTokenSymbol ? `${biddingTokenSymbol.length * 8 + 16}px` : '40px' }} inputMode="decimal" value={minFunding} onChange={(e) => onMinFundingTokenChange(e.target.value.replace(/[^0-9.]/g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!minFunding) setMinFunding('0'); }} placeholder="0" />
                            <span style={{ position: 'absolute' as const, right: '10px', top: '50%', transform: 'translateY(-50%)', color: color.textMuted, fontSize: '12px', fontFamily: font.body, pointerEvents: 'none' as const }}>{biddingTokenSymbol || 'Token'}</span>
                        </div>
                        <div style={{ flex: 1, position: 'relative' as const }}>
                            <input style={{ ...inputStyle, paddingRight: '40px' }} inputMode="decimal" value={minFundingUsd} onChange={(e) => onMinFundingUsdChange(e.target.value.replace(/[^0-9.]/g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!minFundingUsd) setMinFundingUsd('0'); }} placeholder="0" />
                            <span style={{ position: 'absolute' as const, right: '10px', top: '50%', transform: 'translateY(-50%)', color: color.textMuted, fontSize: '12px', fontFamily: font.body, pointerEvents: 'none' as const }}>USD</span>
                        </div>
                    </div>
                </div>
            </div>
            <div style={s.row}>
                <div style={s.field}>
                    <label style={labelStyle}>Reserve Price (USD) per Token<HelpTip text="The lowest USD price per token you are willing to accept. Bids below this price will not be filled. The equivalent amount in bidding tokens is calculated automatically." /></label>
                    <input style={inputStyle} inputMode="decimal" value={reservePriceUsd} onChange={(e) => onReservePriceChange(e.target.value.replace(/[^0-9.]/g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!reservePriceUsd) setReservePriceUsd('0'); }} placeholder="0" />
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Min Received for Entire Lot<HelpTip text="The minimum total bidding tokens you will receive for the entire batch of auction tokens. Auto-calculated from Total Auction Tokens and Reserve Price, or enter directly to set the reserve price." /></label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative' as const }}>
                            <input style={{ ...inputStyle, paddingRight: biddingTokenSymbol ? `${biddingTokenSymbol.length * 8 + 16}px` : '40px' }} inputMode="decimal" value={minReceiveBidding} onChange={(e) => onMinReceiveTokenChange(e.target.value.replace(/[^0-9.]/g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!minReceiveBidding) setMinReceiveBidding('0'); }} placeholder="0" />
                            <span style={{ position: 'absolute' as const, right: '10px', top: '50%', transform: 'translateY(-50%)', color: color.textMuted, fontSize: '12px', fontFamily: font.body, pointerEvents: 'none' as const }}>{biddingTokenSymbol || 'Token'}</span>
                        </div>
                        <div style={{ flex: 1, position: 'relative' as const }}>
                            <input style={{ ...inputStyle, paddingRight: '40px' }} inputMode="decimal" value={minReceiveUsd} onChange={(e) => onMinReceiveUsdChange(e.target.value.replace(/[^0-9.]/g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!minReceiveUsd) setMinReceiveUsd('0'); }} placeholder="0" />
                            <span style={{ position: 'absolute' as const, right: '10px', top: '50%', transform: 'translateY(-50%)', color: color.textMuted, fontSize: '12px', fontFamily: font.body, pointerEvents: 'none' as const }}>USD</span>
                        </div>
                    </div>
                </div>
            </div>
            <div style={s.row}>
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
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                            <input
                                style={{ ...inputStyle, flex: 1, colorScheme: 'dark' }}
                                type="date"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                            />
                            <input
                                style={{ ...inputStyle, width: '120px', colorScheme: 'dark' }}
                                type="time"
                                step="60"
                                value={scheduledTime}
                                onChange={(e) => {
                                    const [h, m] = e.target.value.split(':');
                                    setScheduledTime(`${(h || '12').padStart(2, '0')}:${(m || '00').padStart(2, '0')}`);
                                }}
                            />
                            <select
                                style={{ ...inputStyle, width: '70px', cursor: 'pointer' }}
                                value={scheduledAmPm}
                                onChange={(e) => setScheduledAmPm(e.target.value as 'AM' | 'PM')}
                            >
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                            </select>
                        </div>
                    )}
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Min Bid Per Order{biddingTokenSymbol ? ` (${biddingTokenSymbol})` : ''}<HelpTip text="The minimum amount of bidding tokens a single bid must contain. Prevents spam and dust bids. Set to 0 to allow any amount." /></label>
                    <input style={inputStyle} inputMode="decimal" value={minBidPerOrder} onChange={(e) => setMinBidPerOrder(e.target.value.replace(/[^0-9.]/g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!minBidPerOrder) setMinBidPerOrder('0'); }} placeholder="0" />
                </div>
            </div>
            <div style={s.row}>
                <div style={s.field}>
                    <label style={labelStyle}>Cancel Window (optional)<HelpTip text={startMode === 'schedule' ? 'How long after the scheduled start bidders are allowed to cancel their bids. Once this window closes, all placed bids are locked in and cannot be withdrawn.' : 'How long from now bidders are allowed to cancel their bids. Once this window closes, all placed bids are locked in and cannot be withdrawn.'} /></label>
                    <div style={s.dualInput}>
                        <input style={s.shortInput} type="number" min="0" value={cancelDays} onChange={(e) => setCancelDays(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!cancelDays) setCancelDays('0'); }} />
                        <span style={s.unitLabel}>days</span>
                        <input style={s.shortInput} type="number" min="0" max="23" value={cancelHours} onChange={(e) => setCancelHours(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!cancelHours) setCancelHours('0'); }} />
                        <span style={s.unitLabel}>hours</span>
                        <input style={s.shortInput} type="number" min="0" max="59" value={cancelMinutes} onChange={(e) => setCancelMinutes(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!cancelMinutes) setCancelMinutes('0'); }} />
                        <span style={s.unitLabel}>min</span>
                    </div>
                </div>
                <div style={s.field}>
                    <label style={labelStyle}>Auction Duration<HelpTip text={startMode === 'schedule' ? 'How long the auction runs after the scheduled start. No new bids can be placed after this period ends, and the auction becomes eligible for settlement.' : 'How long the auction runs from now. No new bids can be placed after this period ends, and the auction becomes eligible for settlement.'} /></label>
                    <div style={s.dualInput}>
                        <input style={s.shortInput} type="number" min="0" value={auctionDays} onChange={(e) => setAuctionDays(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!auctionDays) setAuctionDays('0'); }} />
                        <span style={s.unitLabel}>days</span>
                        <input style={s.shortInput} type="number" min="0" max="23" value={auctionHours} onChange={(e) => setAuctionHours(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!auctionHours) setAuctionHours('0'); }} />
                        <span style={s.unitLabel}>hours</span>
                        <input style={s.shortInput} type="number" min="0" max="59" value={auctionMinutes} onChange={(e) => setAuctionMinutes(e.target.value.replace(/\./g, ''))} onFocus={(e) => e.target.select()} onBlur={() => { if (!auctionMinutes) setAuctionMinutes('0'); }} />
                        <span style={s.unitLabel}>min</span>
                    </div>
                </div>
            </div>

            {(() => {
                const sellNum = parseFloat(sellAmount);
                const hasPrice = parseFloat(reservePriceUsd) > 0 || parseFloat(minReceiveBidding) > 0;
                const hasMinBid = parseFloat(minBidPerOrder) > 0;
                const hasDuration = (parseInt(auctionDays, 10) || 0) > 0 || (parseInt(auctionHours, 10) || 0) > 0 || (parseInt(auctionMinutes, 10) || 0) > 0;
                const formReady = !!auctioningToken && !!biddingToken && sellNum > 0 && hasPrice && hasMinBid && hasDuration;
                const disabled = busy || !connected || !formReady;
                const label = step === 'approving' ? 'Approving...' : step === 'creating' ? 'Creating...' : 'Create Auction';
                return (
                <button
                    className="glow-amber"
                    style={{ ...btnPrimary, width: '100%', ...(disabled ? btnDisabled : {}) }}
                    disabled={disabled}
                    onClick={() => void handleCreateAuction()}
                >
                    {label}
                </button>
                );
            })()}

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
