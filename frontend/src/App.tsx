import { useState, useEffect } from 'react';
import { useWallet } from './hooks/useWallet.js';
import { useOpnosis } from './hooks/useOpnosis.js';
import { AuctionList } from './components/AuctionList.js';
import { ResultsList } from './components/ResultsList.js';
import { CreateAuction } from './components/CreateAuction.js';
import { AuctionDetail } from './components/AuctionDetail.js';
import { FAQ } from './components/FAQ.js';
import { API_BASE_URL } from './constants.js';
import { formatTokenAmount } from '@opnosis/shared';
import { color, font, btnPrimary, btnSecondary } from './styles.js';
import type { AuctionStats } from './types.js';

type Tab = 'browse' | 'results' | 'create' | 'detail' | 'faq';

/* ── Inline styles ────────────────────────────────────────────────── */

const s = {
    /* Page shell */
    page: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: `radial-gradient(ellipse at 50% 0%, rgba(107, 45, 123, 0.08) 0%, transparent 60%), ${color.bgDeep}`,
    } as React.CSSProperties,

    /* Header */
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 32px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        background: 'rgba(20, 20, 32, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
    } as React.CSSProperties,
    logoArea: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
    } as React.CSSProperties,
    logoText: {
        fontFamily: font.display,
        fontSize: '24px',
        fontWeight: 700,
        color: color.textPrimary,
    } as React.CSSProperties,
    logoSub: {
        fontFamily: font.body,
        fontSize: '11px',
        color: color.amber,
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        marginTop: '2px',
    } as React.CSSProperties,

    /* Navigation */
    nav: {
        display: 'flex',
        gap: '32px',
    } as React.CSSProperties,
    navLink: (active: boolean): React.CSSProperties => ({
        background: 'none',
        border: 'none',
        padding: '8px 0',
        fontFamily: font.display,
        fontSize: '14px',
        fontWeight: 500,
        color: active ? color.amber : color.textSecondary,
        cursor: 'pointer',
        borderBottom: active ? `2px solid ${color.amber}` : '2px solid transparent',
        transition: 'color 0.2s, border-color 0.2s',
        letterSpacing: '0.02em',
    }),

    /* Wallet button */
    connectBtn: {
        ...btnPrimary,
        padding: '10px 20px',
        fontSize: '13px',
    } as React.CSSProperties,
    walletInfo: {
        textAlign: 'right' as const,
    } as React.CSSProperties,
    walletAddr: {
        fontSize: '12px',
        fontFamily: font.body,
        color: color.textSecondary,
        marginBottom: '4px',
    } as React.CSSProperties,
    disconnectBtn: {
        ...btnSecondary,
        padding: '6px 14px',
        fontSize: '12px',
        borderColor: color.borderStrong,
        color: color.textSecondary,
    } as React.CSSProperties,

    /* Main content */
    main: {
        maxWidth: '1040px',
        width: '100%',
        margin: '0 auto',
        padding: '0 32px',
        flex: 1,
    } as React.CSSProperties,

    /* Hero */
    hero: {
        padding: '64px 0 48px',
        textAlign: 'center' as const,
    } as React.CSSProperties,
    heroTitle: {
        fontFamily: font.display,
        fontSize: '48px',
        fontWeight: 700,
        color: color.textPrimary,
        lineHeight: 1.1,
        marginBottom: '20px',
    } as React.CSSProperties,
    heroAccent: {
        background: `linear-gradient(135deg, ${color.amber}, ${color.amberLight})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
    } as React.CSSProperties,
    heroDesc: {
        fontFamily: font.body,
        fontSize: '17px',
        color: color.textSecondary,
        lineHeight: 1.6,
        maxWidth: '560px',
        margin: '0 auto 32px',
    } as React.CSSProperties,
    heroBtns: {
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap' as const,
        justifyContent: 'center',
    } as React.CSSProperties,

    /* Feature pills */
    features: {
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap' as const,
        justifyContent: 'center',
        marginBottom: '40px',
    } as React.CSSProperties,
    pill: {
        padding: '12px 24px',
        borderRadius: '40px',
        border: `1px solid ${color.borderStrong}`,
        background: color.bgSurface,
        fontFamily: font.display,
        fontSize: '15px',
        fontWeight: 500,
        color: color.textSecondary,
        boxShadow: '0 1px 8px rgba(0, 0, 0, 0.2)',
    } as React.CSSProperties,
    pillIcon: {
        marginRight: '8px',
    } as React.CSSProperties,

    /* Stats row */
    statsRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '40px',
    } as React.CSSProperties,
    statCard: {
        background: color.bgSurface,
        borderRadius: '10px',
        padding: '20px',
        border: `1px solid ${color.borderSubtle}`,
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.3)',
        transition: 'box-shadow 0.2s, transform 0.2s',
    } as React.CSSProperties,
    statValue: {
        fontFamily: font.display,
        fontSize: '28px',
        fontWeight: 700,
        color: color.amber,
        lineHeight: 1,
        marginBottom: '6px',
    } as React.CSSProperties,
    statLabel: {
        fontFamily: font.body,
        fontSize: '12px',
        color: color.textMuted,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
    } as React.CSSProperties,

    /* Content area */
    content: {
        paddingBottom: '64px',
    } as React.CSSProperties,

    /* Error */
    error: {
        color: color.error,
        marginBottom: '16px',
        fontSize: '14px',
        fontFamily: font.body,
        padding: '12px 16px',
        borderRadius: '8px',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
    } as React.CSSProperties,

    /* Footer */
    footer: {
        borderTop: `1px solid ${color.borderSubtle}`,
        padding: '24px 32px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '24px',
        flexWrap: 'wrap' as const,
        background: 'rgba(20, 20, 32, 0.5)',
    } as React.CSSProperties,
    footerLink: {
        fontFamily: font.body,
        fontSize: '13px',
        color: color.textMuted,
        textDecoration: 'none',
        transition: 'color 0.2s',
    } as React.CSSProperties,
    footerSep: {
        color: color.borderSubtle,
        fontSize: '12px',
    } as React.CSSProperties,
};

/* ── Component ────────────────────────────────────────────────────── */

export function App() {
    const { wallet, provider, connect, disconnect, error: walletError } = useWallet();
    const opnosis = useOpnosis(provider, wallet.network);
    const [tab, setTab] = useState<Tab>('browse');
    const [selectedAuctionId, setSelectedAuctionId] = useState<string>('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [stats, setStats] = useState<AuctionStats | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function loadStats() {
            try {
                const res = await fetch(`${API_BASE_URL}/stats`);
                if (!res.ok) return;
                const data = await res.json() as AuctionStats;
                if (!cancelled) setStats(data);
            } catch {
                // stats unavailable
            }
        }
        void loadStats();
        return () => { cancelled = true; };
    }, [refreshKey]);

    const viewAuction = (id: string) => {
        setSelectedAuctionId(id);
        setTab('detail');
    };

    const onCreated = () => setRefreshKey((k) => k + 1);

    const showHero = tab === 'browse';

    return (
        <div style={s.page}>
            {/* ── Header ──────────────────────────────────────── */}
            <header style={s.header}>
                <div style={s.logoArea}>
                    <img src="/opnosis-avatar.svg" alt="Opnosis Auction" style={{ width: '48px', height: '48px' }} />
                    <div>
                        <div style={s.logoText}>Opnosis Auction</div>
                        <div style={s.logoSub}>Batch Auctions on Bitcoin L1</div>
                    </div>
                </div>

                <nav style={s.nav}>
                    <button style={s.navLink(tab === 'browse')} onClick={() => setTab('browse')}>Browse</button>
                    <button style={s.navLink(tab === 'results')} onClick={() => setTab('results')}>Results</button>
                    <button style={s.navLink(tab === 'create')} onClick={() => setTab('create')}>Create</button>
                    <button style={s.navLink(tab === 'faq')} onClick={() => setTab('faq')}>FAQ</button>
                </nav>

                <div>
                    {wallet.connected ? (
                        <div style={s.walletInfo}>
                            <div style={s.walletAddr}>
                                {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)} ({wallet.network})
                            </div>
                            <button style={s.disconnectBtn} onClick={disconnect}>Disconnect</button>
                        </div>
                    ) : (
                        <button style={s.connectBtn} onClick={() => void connect()}>
                            Connect OP_WALLET
                        </button>
                    )}
                </div>
            </header>

            {/* ── Main ────────────────────────────────────────── */}
            <main style={s.main}>
                {walletError && <div style={s.error}>{walletError}</div>}

                {/* Hero (browse tab only) */}
                {showHero && (
                    <section style={s.hero}>
                        <h1 style={s.heroTitle}>
                            Fair Price Discovery{' '}
                            <span style={s.heroAccent}>on Bitcoin</span>
                        </h1>
                        <p style={s.heroDesc}>
                            Batch auctions where every winner pays the same clearing price.
                            No front-running. No MEV. Pure price discovery powered by OPNet.
                        </p>
                        <div style={s.heroBtns}>
                            <button style={btnPrimary} onClick={() => setTab('browse')}>Browse Auctions</button>
                            <button style={btnSecondary} onClick={() => setTab('create')}>Create Auction</button>
                        </div>
                    </section>
                )}

                {/* Feature pills (browse tab only) */}
                {showHero && (
                    <div style={s.features}>
                        <div style={s.pill}><span style={s.pillIcon}>&#9878;</span>Fair Pricing</div>
                        <div style={s.pill}><span style={s.pillIcon}>&#9935;</span>Front-Running Resistant</div>
                        <div style={s.pill}><span style={s.pillIcon}>&#9881;</span>Permissionless</div>
                        <div style={s.pill}><span style={s.pillIcon}>&#8383;</span>Bitcoin Native</div>
                        <div style={s.pill}><span style={s.pillIcon}>&#128272;</span>Fully Open Source</div>
                    </div>
                )}


                {/* Stats row */}
                {stats && (
                    <div style={s.statsRow}>
                        <div style={s.statCard}>
                            <div style={s.statValue}>{stats.totalAuctions}</div>
                            <div style={s.statLabel}>Auctions</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={s.statValue}>{stats.settledAuctions}</div>
                            <div style={s.statLabel}>Settled</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={s.statValue}>{stats.openAuctions}</div>
                            <div style={s.statLabel}>Open</div>
                        </div>
                        <div style={s.statCard}>
                            <div style={s.statValue}>{formatTokenAmount(BigInt(stats.totalVolume))}</div>
                            <div style={s.statLabel}>Total Volume</div>
                        </div>
                    </div>
                )}

                {/* Tab content */}
                <div style={s.content}>
                    {tab === 'browse' && <AuctionList onSelect={viewAuction} refreshKey={refreshKey} />}
                    {tab === 'results' && <ResultsList />}
                    {tab === 'create' && (
                        <CreateAuction
                            connected={wallet.connected}
                            network={wallet.network}
                            opnosis={opnosis}
                            onCreated={onCreated}
                        />
                    )}
                    {tab === 'detail' && (
                        <AuctionDetail
                            auctionId={selectedAuctionId}
                            connected={wallet.connected}
                            opnosis={opnosis}
                            onBack={() => setTab('browse')}
                        />
                    )}
                    {tab === 'faq' && <FAQ />}
                </div>
            </main>

            {/* ── Footer ──────────────────────────────────────── */}
            <footer style={s.footer}>
                <a href="https://github.com/bobopnet/opnosis" target="_blank" rel="noopener noreferrer" style={s.footerLink}>GitHub</a>
                <span style={s.footerSep}>|</span>
                <a href="https://t.me/+_oC6gbqZGyo0YzU1" target="_blank" rel="noopener noreferrer" style={s.footerLink}>Telegram</a>
                <span style={s.footerSep}>|</span>
                <a href="/TERMS_OF_SERVICE.md" target="_blank" rel="noopener noreferrer" style={s.footerLink}>Terms of Service</a>
                <span style={s.footerSep}>|</span>
                <a href="/PRIVACY_POLICY.md" target="_blank" rel="noopener noreferrer" style={s.footerLink}>Privacy Policy</a>
            </footer>
        </div>
    );
}
