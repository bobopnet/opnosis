import { useState, useEffect, useRef } from 'react';
import { useWallet } from './hooks/useWallet.js';
import { useOpnosis } from './hooks/useOpnosis.js';
import { AuctionList } from './components/AuctionList.js';
import { MyBids } from './components/MyBids.js';
import { ResultsList } from './components/ResultsList.js';
import { CreateAuction } from './components/CreateAuction.js';
import { FAQ } from './components/FAQ.js';
import { API_BASE_URL } from './constants.js';
import { color, font, btnPrimary, btnSecondary } from './styles.js';
import type { AuctionStats } from './types.js';

type Tab = 'main' | 'browse' | 'mybids' | 'results' | 'create' | 'faq';

/* ── Inline styles ────────────────────────────────────────────────── */

const s = {
    /* Page shell */
    page: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: `radial-gradient(ellipse at 50% 0%, rgba(107, 45, 123, 0.08) 0%, transparent 60%), ${color.bgDeep}`,
        position: 'relative' as const,
    } as React.CSSProperties,
    pageBg: {
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        height: '115vh',
        width: 'auto',
        opacity: 0.35,
        pointerEvents: 'none',
        zIndex: 0,
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
        position: 'relative' as const,
        zIndex: 1,
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
        color: color.textSecondary,
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
        borderTop: `1px solid ${color.borderStrong}`,
        padding: '24px 32px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '24px',
        flexWrap: 'wrap' as const,
        background: 'rgba(30, 30, 46, 0.6)',
    } as React.CSSProperties,
    footerLink: {
        fontFamily: font.body,
        fontSize: '13px',
        color: color.textSecondary,
        textDecoration: 'none',
        transition: 'color 0.2s',
    } as React.CSSProperties,
    footerSep: {
        color: color.textMuted,
        fontSize: '12px',
    } as React.CSSProperties,
};

/* ── Component ────────────────────────────────────────────────────── */

export function App() {
    const { wallet, provider, connect, disconnect, error: walletError } = useWallet();
    const opnosis = useOpnosis(provider, wallet.network, wallet.address || undefined, wallet.publicKey || undefined);
    const [tab, setTab] = useState<Tab>('main');
    const [refreshKey, setRefreshKey] = useState(0);
    const auctionsRef = useRef<HTMLDivElement>(null);
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

    const onCreated = () => setRefreshKey((k) => k + 1);

    const showHero = tab === 'main';

    return (
        <div style={s.page}>
            <img src="/opnosis-avatar.svg" alt="" style={s.pageBg} />
            {/* ── Header ──────────────────────────────────────── */}
            <header style={s.header}>
                <div style={s.logoArea}>
                    <video
                        src="/opnosis-logo-animated"
                        autoPlay
                        loop
                        muted
                        playsInline
                        style={{ width: '48px', height: '48px', borderRadius: '50%' }}
                    />
                    <div>
                        <div style={s.logoText}>Opnosis Auction</div>
                        <div style={s.logoSub}>Batch Auctions on Bitcoin L1</div>
                    </div>
                </div>

                <nav style={s.nav}>
                    <button style={s.navLink(tab === 'main')} onClick={() => setTab('main')}>Main</button>
                    <button style={s.navLink(tab === 'browse')} onClick={() => setTab('browse')}>Browse</button>
                    <button style={s.navLink(tab === 'mybids')} onClick={() => setTab('mybids')}>My Bids</button>
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
                        <div style={s.pill}><span style={s.pillIcon}>&#9889;</span>Atomic Closure</div>
                        <div style={s.pill}><span style={s.pillIcon}>&#8634;</span>Extendable by Auctioneer</div>
                    </div>
                )}


                {/* Stats row (main page only) */}
                {showHero && stats && stats.upcomingAuctions > 0 && (
                    <div style={s.statsRow}>
                        <div style={s.statCard}>
                            <div style={s.statValue}>{stats.upcomingAuctions}</div>
                            <div style={s.statLabel}>Upcoming</div>
                        </div>
                    </div>
                )}

                {/* Tab content */}
                <div ref={auctionsRef} style={s.content}>
                    {tab === 'browse' && <AuctionList connected={wallet.connected} opnosis={opnosis} refreshKey={refreshKey} />}
                    {tab === 'mybids' && <MyBids connected={wallet.connected} opnosis={opnosis} />}
                    {tab === 'results' && <ResultsList stats={stats} />}
                    {tab === 'create' && (
                        <CreateAuction
                            connected={wallet.connected}
                            network={wallet.network}
                            opnosis={opnosis}
                            onCreated={onCreated}
                        />
                    )}
{tab === 'faq' && <FAQ />}
                </div>
            </main>

            {/* ── Footer ──────────────────────────────────────── */}
            <footer style={s.footer}>
                <a href="https://github.com/bobopnet/opnosis" target="_blank" rel="noopener noreferrer" style={s.footerLink} title="GitHub"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg></a>
                <span style={s.footerSep}>|</span>
                <a href="https://t.me/+_oC6gbqZGyo0YzU1" target="_blank" rel="noopener noreferrer" style={s.footerLink} title="Telegram"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg></a>
                <span style={s.footerSep}>|</span>
                <a href="/TERMS_OF_SERVICE.md" target="_blank" rel="noopener noreferrer" style={s.footerLink}>Terms of Service</a>
                <span style={s.footerSep}>|</span>
                <a href="/PRIVACY_POLICY.md" target="_blank" rel="noopener noreferrer" style={s.footerLink}>Privacy Policy</a>
            </footer>
        </div>
    );
}
