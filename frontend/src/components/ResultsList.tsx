import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants.js';
import { formatTokenAmount, formatPrice } from '@opnosis/shared';
import {
    color, font, card, badge as badgeStyle,
    sectionTitle as sectionTitleStyle,
} from '../styles.js';
import type { IndexedAuction, IndexedClearing, AuctionStats } from '../types.js';

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
    totalRaised: {
        textAlign: 'center' as const,
        marginBottom: '32px',
    } as React.CSSProperties,
    totalRaisedValue: {
        fontFamily: font.display,
        fontSize: '36px',
        fontWeight: 700,
        color: color.amber,
        lineHeight: 1.2,
    } as React.CSSProperties,
    totalRaisedLabel: {
        fontFamily: font.body,
        fontSize: '13px',
        color: color.textSecondary,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        marginTop: '4px',
    } as React.CSSProperties,
};

interface ResultRow {
    auction: IndexedAuction;
    clearing: IndexedClearing | null;
    usdPrice: number;
}

interface Props {
    readonly stats: AuctionStats | null;
}

export function ResultsList({ stats }: Props) {
    const [rows, setRows] = useState<ResultRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch(`${API_BASE_URL}/auctions`);
                if (!res.ok) throw new Error('Failed to fetch');
                const auctions = await res.json() as IndexedAuction[];
                const finished = auctions.filter((a) => {
                    // Use backend status OR client-side time (whichever is more advanced)
                    const clientEnded = BigInt(Date.now()) >= BigInt(a.auctionEndDate);
                    return a.isSettled || a.status === 'ended' || clientEnded;
                });

                const results: ResultRow[] = await Promise.all(
                    finished.map(async (auction) => {
                        let clearing: IndexedClearing | null = null;
                        let usdPrice = 0;
                        try {
                            if (auction.isSettled) {
                                const cRes = await fetch(`${API_BASE_URL}/auctions/${auction.id}/clearing`);
                                if (cRes.ok) clearing = await cRes.json() as IndexedClearing;
                            }
                        } catch { /* clearing unavailable */ }
                        try {
                            const pRes = await fetch(`${API_BASE_URL}/price/${auction.biddingToken}`);
                            if (pRes.ok) {
                                const data = await pRes.json() as { usd: number };
                                if (data.usd > 0) usdPrice = data.usd;
                            }
                        } catch { /* price unavailable */ }
                        return { auction, clearing, usdPrice };
                    }),
                );

                // Most recent first
                results.sort((a, b) => Number(b.auction.id) - Number(a.auction.id));
                if (!cancelled) setRows(results);
            } catch {
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, []);

    if (loading) return <div style={s.loading}>Loading results...</div>;
    if (rows.length === 0) return (
        <>
            <div style={sectionTitleStyle}>Results</div>
            <div style={s.empty}>No settled or ended auctions yet</div>
        </>
    );

    return (
        <>
            <div style={{ marginBottom: '16px' }}>
                <div style={sectionTitleStyle}>Results</div>
            </div>

            {stats && Number(stats.totalRaisedUsd) > 0 && (
                <div style={s.totalRaised}>
                    <div style={s.totalRaisedValue}>${Number(stats.totalRaisedUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div style={s.totalRaisedLabel}>Total Raised Across All Auctions</div>
                </div>
            )}

            <div style={s.tableWrap}>
                <table style={s.table}>
                    <thead>
                        <tr style={{ borderBottom: `1px solid ${color.borderStrong}`, background: color.bgElevated }}>
                            <th style={s.th}>Auction</th>
                            <th style={s.th}>Total Auction Tokens</th>
                            <th style={s.th}>Total Raised</th>
                            <th style={s.th}>Total Raised (USD)</th>
                            <th style={s.th}>Clearing Price (USD)</th>
                            <th style={s.th}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ auction: a, clearing, usdPrice }) => {
                            const minFunding = BigInt(a.minFundingThreshold || '0');
                            const totalBidAmt = BigInt(a.totalBidAmount || '0');
                            const clientEnded = BigInt(Date.now()) >= BigInt(a.auctionEndDate);
                            const currentStatus = (a.status === 'ended' || clientEnded) ? 'ended' : a.status;
                            const isFailed = a.fundingNotReached
                                || (currentStatus === 'ended' && !a.isSettled && minFunding > 0n && totalBidAmt < minFunding);

                            // Compute actual raised from clearing data (clearing price × tokens sold)
                            // totalBidAmount includes excess refunded to bidders
                            let raisedTokens: bigint;
                            if (isFailed) {
                                raisedTokens = 0n;
                            } else if (clearing) {
                                const sellAmt = BigInt(a.auctionedSellAmount);
                                const clearBuy = BigInt(clearing.clearingBuyAmount);
                                const clearSell = BigInt(clearing.clearingSellAmount);
                                raisedTokens = sellAmt * clearSell / clearBuy;
                            } else {
                                raisedTokens = BigInt(a.totalBidAmount || '0');
                            }
                            const raisedHuman = Number(raisedTokens) / (10 ** a.biddingTokenDecimals);
                            const usdValue = !isFailed && usdPrice > 0 && raisedHuman > 0
                                ? `$${(raisedHuman * usdPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '--';

                            let clearingPrice = '--';
                            if (!isFailed && clearing) {
                                // Human price = (sell / 10^biddingDec) / (buy / 10^auctioningDec)
                                const sellHuman = Number(BigInt(clearing.clearingSellAmount)) / (10 ** a.biddingTokenDecimals);
                                const buyHuman = Number(BigInt(clearing.clearingBuyAmount)) / (10 ** a.auctioningTokenDecimals);
                                const tokenRatio = buyHuman > 0 ? sellHuman / buyHuman : 0;
                                if (usdPrice > 0 && tokenRatio > 0) {
                                    clearingPrice = `$${(tokenRatio * usdPrice).toFixed(2)}`;
                                } else {
                                    clearingPrice = formatPrice(BigInt(clearing.clearingSellAmount), BigInt(clearing.clearingBuyAmount), a.biddingTokenDecimals, a.auctioningTokenDecimals) + ` ${a.biddingTokenSymbol}`;
                                }
                            }

                            const isSettled = a.isSettled;

                            return (
                                <tr key={a.id} style={s.row}>
                                    <td style={s.td}>
                                        <div style={s.auctionName}>{a.auctioningTokenName || `Auction #${a.id}`}</div>
                                    </td>
                                    <td style={s.td}>
                                        {formatTokenAmount(BigInt(a.auctionedSellAmount), a.auctioningTokenDecimals).split('.')[0]} {a.auctioningTokenSymbol}
                                    </td>
                                    <td style={s.td}>
                                        {isFailed ? '--' : `${formatTokenAmount(raisedTokens, a.biddingTokenDecimals).split('.')[0]} ${a.biddingTokenSymbol}`}
                                    </td>
                                    <td style={s.td}>{usdValue}</td>
                                    <td style={s.td}>
                                        <span style={{ color: isSettled && !isFailed ? color.amber : color.textMuted, fontWeight: isSettled && !isFailed ? 600 : 400 }}>
                                            {clearingPrice}
                                        </span>
                                    </td>
                                    <td style={s.td}>
                                        <span style={badgeStyle(isFailed ? 'muted' : isSettled ? 'success' : 'muted')}>
                                            {isFailed ? 'Failed' : isSettled ? 'Settled' : 'Ended'}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
}
