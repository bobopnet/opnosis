import { useState, useEffect, useRef } from 'react';
import { color, font, card } from '../styles.js';

/* ── Styles ────────────────────────────────────────────────────────── */

const s = {
    container: {
        maxWidth: '800px',
        margin: '0 auto',
    } as React.CSSProperties,
    title: {
        fontSize: '28px',
        fontWeight: 700,
        fontFamily: font.display,
        color: color.textPrimary,
        marginBottom: '8px',
    } as React.CSSProperties,
    subtitle: {
        fontSize: '15px',
        fontFamily: font.body,
        color: color.textSecondary,
        marginBottom: '36px',
        lineHeight: 1.5,
    } as React.CSSProperties,
    section: {
        marginBottom: '32px',
    } as React.CSSProperties,
    sectionHeader: {
        fontSize: '16px',
        fontWeight: 600,
        fontFamily: font.display,
        color: color.amber,
        marginBottom: '12px',
        paddingLeft: '12px',
        borderLeft: `3px solid ${color.amber}`,
    } as React.CSSProperties,
    item: {
        ...card,
        borderLeft: `1px solid ${color.borderSubtle}`,
        marginBottom: '8px',
        padding: 0,
        cursor: 'pointer',
        overflow: 'hidden',
    } as React.CSSProperties,
    question: (open: boolean): React.CSSProperties => ({
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        fontFamily: font.display,
        fontSize: '14px',
        fontWeight: 500,
        color: open ? color.textPrimary : color.textSecondary,
        transition: 'color 0.2s',
    }),
    chevron: (open: boolean): React.CSSProperties => ({
        fontSize: '12px',
        color: color.textMuted,
        transition: 'transform 0.2s',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        flexShrink: 0,
        marginLeft: '12px',
    }),
    answer: {
        padding: '0 20px 16px',
        fontFamily: font.body,
        fontSize: '13px',
        color: color.textSecondary,
        lineHeight: 1.65,
    } as React.CSSProperties,
    table: {
        width: '100%',
        borderCollapse: 'collapse' as const,
        marginTop: '8px',
    } as React.CSSProperties,
    th: {
        textAlign: 'left' as const,
        padding: '8px 10px',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: font.display,
        color: color.textMuted,
        borderBottom: `1px solid ${color.borderSubtle}`,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em',
    } as React.CSSProperties,
    td: {
        padding: '8px 10px',
        fontSize: '13px',
        fontFamily: font.body,
        color: color.textSecondary,
        borderBottom: `1px solid ${color.borderSubtle}`,
        verticalAlign: 'top' as const,
    } as React.CSSProperties,
    tdField: {
        padding: '8px 10px',
        fontSize: '13px',
        fontFamily: font.display,
        fontWeight: 500,
        color: color.textPrimary,
        borderBottom: `1px solid ${color.borderSubtle}`,
        verticalAlign: 'top' as const,
        whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
};

/* ── Data ──────────────────────────────────────────────────────────── */

interface QA {
    readonly id?: string;
    readonly q: string;
    readonly a: React.ReactNode;
}

interface Section {
    readonly title: string;
    readonly items: QA[];
}

const fieldTable = (
    <table style={s.table}>
        <thead>
            <tr><th style={s.th}>Field</th><th style={s.th}>Description</th></tr>
        </thead>
        <tbody>
            <tr><td style={s.tdField}>Auctioning Token</td><td style={s.td}>The OP-20 token you are selling.</td></tr>
            <tr><td style={s.tdField}>Bidding Token</td><td style={s.td}>The OP-20 token bidders use to place bids.</td></tr>
            <tr><td style={s.tdField}>Sell Amount</td><td style={s.td}>Total tokens you are putting up for auction.</td></tr>
            <tr><td style={s.tdField}>Min Buy Amount</td><td style={s.td}>Minimum total bids you will accept. Sets the reserve price. Bids below the reserve are accepted on-chain but will be treated as losing bids during settlement and automatically refunded.</td></tr>
            <tr><td style={s.tdField}>Min Bid Per Order</td><td style={s.td}>Smallest individual bid allowed. Prevents dust bids.</td></tr>
            <tr><td style={s.tdField}>Min Funding Threshold</td><td style={s.td}>Minimum number of bidding tokens the auctioneer expects to receive. If not met, the auction fails and all tokens are returned. Only bids at or above the reserve price count toward meeting this threshold — below-reserve bids are excluded. 0 = disabled.</td></tr>
            <tr><td style={s.tdField}>Start Mode</td><td style={s.td}>&ldquo;Start Now&rdquo; opens bidding immediately. &ldquo;Schedule Start&rdquo; delays bidding until a chosen date and time. Note: scheduled times are based on blockchain time, which can differ from your wall clock by a few minutes.</td></tr>
            <tr><td style={s.tdField}>Cancel Window</td><td style={s.td}>Minutes during which bidders can cancel. After this, bids are final.</td></tr>
            <tr><td style={s.tdField}>Auction Duration</td><td style={s.td}>Minutes the auction accepts bids before settlement.</td></tr>
        </tbody>
    </table>
);

const sections: Section[] = [
    {
        title: 'General',
        items: [
            {
                q: 'What is Opnosis Auction?',
                a: 'Opnosis Auction is a permissionless batch auction platform running on Bitcoin Layer 1 via OPNet. It lets anyone create token auctions where all winning bidders pay the same uniform clearing price \u2014 ensuring fair and transparent price discovery.',
            },
            {
                id: 'fair-pricing',
                q: 'What is a batch auction? How is it different from a Dutch auction?',
                a: <>
                    <strong>Batch auction:</strong> All bids are collected during a fixed window, then a single clearing price is computed so that every winner pays the same price. This prevents front-running and manipulation.
                    <br /><br />
                    <strong>Dutch auction:</strong> The price starts high and decreases over time until buyers accept. Earlier buyers pay more. Dutch auctions are sequential and can be front-run.
                    <br /><br />
                    Batch auctions are fairer because no participant gains an advantage from timing or speed.
                </>,
            },
            {
                id: 'permissionless',
                q: 'Who can use Opnosis Auction \u2014 is it only for institutions?',
                a: <>
                    Opnosis Auction is permissionless software. Anyone with an OP_WALLET &mdash; retail users, projects, DAOs, or institutions &mdash; can create auctions and place bids. There are no KYC requirements, minimum balances, or whitelists.
                    <br /><br />
                    <strong>However</strong>, cryptocurrency laws vary significantly by jurisdiction. Token auctions may be restricted or prohibited in certain countries, including those under international sanctions (e.g., OFAC-sanctioned regions such as North Korea, Iran, Cuba, Syria, and Crimea) and countries that have banned cryptocurrency activity (e.g., China, Algeria, Bangladesh, Nepal, and others). It is <strong>your sole responsibility</strong> to determine whether using this platform is lawful in your jurisdiction. When in doubt, consult a legal professional.
                </>,
            },
            {
                q: 'What are the requirements to participate?',
                a: <>
                    To <strong>bid</strong>, you need an OP_WALLET browser extension with enough bidding tokens and a small amount of BTC for transaction fees.
                    <br /><br />
                    To <strong>create</strong> an auction, you need the tokens you want to sell, plus BTC for fees.
                </>,
            },
            {
                q: 'What wallets are supported?',
                a: 'Opnosis Auction exclusively supports OP_WALLET, the browser extension wallet for the OPNet ecosystem. MetaMask and other Ethereum wallets are not compatible.',
            },
            {
                q: 'What tokens can I use?',
                a: <>
                    <strong>As a bidder:</strong> It depends on the auction. Each auctioneer chooses which OP-20 token they want to receive as payment. You need that specific bidding token to participate.
                    <br /><br />
                    <strong>As an auctioneer:</strong> You can sell any OP-20 token deployed on OPNet and choose any OP-20 token as the bidding currency. The Create form offers popular tokens in a dropdown, but you can also paste any custom OP-20 token address.
                </>,
            },
        ],
    },
    {
        title: 'For Auctioneers',
        items: [
            {
                q: 'How do I create an auction?',
                a: <>
                    1. Connect your OP_WALLET.<br />
                    2. Go to the <strong>Create</strong> tab.<br />
                    3. Select the token you want to sell and the token you want to receive.<br />
                    4. Fill in amounts, duration, and optional settings.<br />
                    5. Approve the sell token, then submit the transaction.
                </>,
            },
            {
                q: 'What does each form field mean?',
                a: fieldTable,
            },
            {
                id: 'no-fee-failed',
                q: 'What is the protocol fee?',
                a: 'Opnosis Auction charges a 0.3% fee on the sell amount, deducted automatically at settlement. The fee is displayed on the Create page. If the auction fails to meet its funding threshold, no protocol fee is charged — the auctioneer\'s full deposit (sell tokens + fee deposit) is returned in full.',
            },
            {
                q: 'What happens if the minimum funding threshold isn\u2019t met?',
                a: <>
                    The auction is marked as <strong>Failed</strong> and <strong>no protocol fee is charged</strong>. The auctioneer&apos;s full deposit (sell tokens + fee deposit) is returned in full. All bidding tokens are automatically refunded to bidders.
                    <br /><br />
                    Only bids at or above the reserve price count toward meeting the minimum funding threshold. Bids below the reserve are excluded from the funding calculation and are refunded after settlement.
                    <br /><br />
                    Your bids will show as <strong>&ldquo;Cancelled&rdquo;</strong> in the <strong>My Bids</strong> tab because the auction did not reach the minimum funding required. This is not a manual cancellation &mdash; it happens automatically when the auction ends without enough total bids.
                    <br /><br />
                    Settlement and refund distribution are fully automatic &mdash; the backend handles both transactions shortly after the auction ends. No manual action is needed from bidders or the auctioneer.
                </>,
            },
            {
                id: 'early-settlement',
                q: 'Can I settle my auction early?',
                a: <>
                    Yes. Every auction has <strong>early settlement</strong> built in. As the auctioneer, you can settle your auction before the scheduled end time as long as the minimum funding threshold has been met.
                    <br /><br />
                    To settle early, go to the <strong>Browse</strong> page, connect the same wallet that created the auction, and expand your auction card. An <strong>Atomic Closure</strong> section with a &ldquo;Settle Now&rdquo; button will appear. This section is only visible to the auctioneer while the auction is still open.
                    <br /><br />
                    Early settlement is useful when a fundraise fills quickly and you don&apos;t need to wait for the full duration. Note: early settlement is only possible when the min funding threshold has been reached. If bids are below the threshold, you must wait for more bids or let the auction run to its end.
                </>,
            },
            {
                id: 'manual-settlement',
                q: 'What if my auction is stuck in "Settling" status?',
                a: <>
                    After an auction ends, the Opnosis backend automatically settles it. If the backend is temporarily unavailable or encounters an issue, the auction may appear stuck in &ldquo;Settling&rdquo; status.
                    <br /><br />
                    In this case, <strong>anyone</strong> with a connected wallet can manually settle the auction:
                    <br /><br />
                    1. Go to the <strong>Browse</strong> page and expand the auction card.<br />
                    2. A <strong>Settlement</strong> section with a &ldquo;Settle Auction&rdquo; button will appear.<br />
                    3. Click it and confirm the transaction in your wallet.
                    <br /><br />
                    Manual settlement costs a small amount of BTC for gas. Once settled, token distribution is triggered automatically.
                </>,
            },
            {
                id: 'extendable',
                q: 'Can I extend my auction after creating it?',
                a: <>
                    Yes. As the auctioneer, you can extend both the cancel window end date and the auction end date at any time before settlement. Open the auction card on the Browse page and use the <strong>Extend Auction</strong> section (visible only to you).
                    <br /><br />
                    <strong>Rules:</strong><br />
                    &bull; You can only push dates forward &mdash; shortening is not allowed.<br />
                    &bull; The cancel window end cannot exceed the auction end date.<br />
                    &bull; Extension is not possible after the auction has been settled.
                    <br /><br />
                    This is useful if you want to give bidders more time to participate or if market conditions change and you want a longer price-discovery window.
                </>,
            },
        ],
    },
    {
        title: 'For Bidders',
        items: [
            {
                q: 'How do I place a bid?',
                a: <>
                    1. Browse open auctions and select one.<br />
                    2. Enter your bid amount and the price you are willing to pay per token.<br />
                    3. Approve the bidding token if needed, then submit your bid.
                </>,
            },
            {
                q: 'Can I cancel my bid?',
                a: 'Yes, but only during the cancel window set by the auctioneer. Once the cancel window closes, all bids are final and cannot be withdrawn.',
            },
            {
                id: 'grace-period',
                q: 'What is the Dynamic Grace Period?',
                a: <>
                    Opnosis Auction uses a <strong>Dynamic Grace Period</strong> to protect bids submitted near the auction deadline without unnecessarily delaying settlement.
                    <br /><br />
                    Placing a bid can require up to two Bitcoin transactions (token approval + bid placement), each needing a block confirmation. Since Bitcoin blocks can occasionally take 15&ndash;45+ minutes, a safety window is needed to include bids broadcast before the deadline.
                    <br /><br />
                    <strong>How it works:</strong> When an auction ends, the system records the current Bitcoin block height on-chain. Settlement is allowed after <strong>1 additional block confirmation</strong> &mdash; typically 10&ndash;15 minutes. This means most auctions settle quickly. A <strong>1-hour hard cap</strong> acts as a safety net in case of exceptionally slow blocks.
                    <br /><br />
                    The bid form is disabled as soon as the auction end time passes &mdash; no new bids can be submitted during the grace period. It only protects bids that were already broadcast to the network before the deadline.
                </>,
            },
            {
                id: 'clearing-price',
                q: 'How is the clearing price determined?',
                a: <>
                    After the auction ends, bids are sorted from highest to lowest price. The algorithm walks down the sorted list until all sell tokens are allocated. The price of the last winning bid becomes the clearing price, and every winner pays this same price.
                    <br /><br />
                    <strong>When demand is lower than supply</strong> (i.e. there are fewer bids than tokens available), all auction tokens are still distributed as long as the minimum funding threshold is met. In this case, the clearing price drops below the lowest bid price, and every bidder receives <strong>more tokens than their minimum</strong> &mdash; proportional to their bid size. This means bidders can get a significantly better deal than the maximum price they were willing to pay.
                </>,
            },
            {
                id: 'full-distribution',
                q: 'What happens when there are more tokens than demand?',
                a: <>
                    This is one of the most powerful features of batch auctions. When the total tokens available exceed what bidders asked for, <strong>all tokens are distributed proportionally</strong> to bidders based on their bid amounts &mdash; as long as the minimum funding threshold is met.
                    <br /><br />
                    <strong>Example:</strong> An auction offers 250,000 tokens. Two bidders place bids totalling 115,000 MOTO. Bidder A bid 50,000 MOTO (at $0.10/token max) and Bidder B bid 65,000 MOTO (at $0.20/token max). Because total demand is less than supply, all 250,000 tokens are distributed:
                    <br /><br />
                    &bull; Bidder A receives ~108,696 tokens (asked for min 45,684)<br />
                    &bull; Bidder B receives ~141,304 tokens (asked for min 29,925)<br />
                    &bull; Clearing price: ~$0.04/token &mdash; far below both bidders&apos; max prices
                    <br /><br />
                    Both bidders get far more tokens than their minimum at a much lower price. The auctioneer still receives all 115,000 MOTO, which exceeded their funding threshold.
                </>,
            },
            {
                q: 'Do I need to claim my tokens after settlement?',
                a: <>
                    No. Token distribution is fully automatic. After an auction is settled, the backend submits a single batch transaction that delivers tokens directly to every participant&apos;s wallet &mdash; winners receive auction tokens and losing bidders receive refunds. No manual claiming is needed.
                    <br /><br />
                    You can track the status of your bids in the <strong>My Bids</strong> tab. See <a href="#" onClick={(e) => { e.stopPropagation(); const el = document.getElementById('auto-settlement'); if (el) { el.click(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }} style={{ color: '#c4b5fd', textDecoration: 'underline' }}>Automatic Settlement</a> for full details.
                </>,
            },
        ],
    },
    {
        title: 'Technical',
        items: [
            {
                id: 'bitcoin-native',
                q: 'What network does Opnosis run on?',
                a: 'Opnosis Auction runs on OPNet, a smart-contract layer on Bitcoin Layer 1. Transactions are secured by Bitcoin\u2019s proof-of-work consensus. The platform supports both testnet and mainnet.',
            },
            {
                id: 'blockchain-time',
                q: 'Why is the scheduled start time slightly different from what I entered?',
                a: <>
                    All auction timing (start, cancel window, end) is based on <strong>blockchain time</strong>, not your local wall clock. Bitcoin block timestamps use median time of previous blocks, which can differ from real-world time by a few minutes.
                    <br /><br />
                    This means a scheduled start of 10:00 AM may appear to start at 9:58 or 10:03 depending on how the blockchain clock compares to your local time. This is normal and expected behavior &mdash; it ensures all participants see consistent, tamper-proof timing enforced by the Bitcoin network.
                </>,
            },
            {
                id: 'auto-settlement',
                q: 'How does automatic settlement and token distribution work?',
                a: <>
                    Once an auction ends, the <strong>Dynamic Grace Period</strong> ensures any bids submitted before the deadline but not yet confirmed on-chain are included. In most cases, settlement happens within minutes &mdash; after just one additional Bitcoin block confirmation. A 1-hour hard cap acts as a safety net for exceptionally slow blocks. See <a href="#" onClick={(e) => { e.stopPropagation(); const el = document.getElementById('grace-period'); if (el) { el.click(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }} style={{ color: '#c4b5fd', textDecoration: 'underline' }}>Dynamic Grace Period</a> for details. After the grace period, the Opnosis backend automatically handles everything &mdash; no action required from the auctioneer or bidders.
                    <br /><br />
                    <strong>Step 1 &mdash; Settlement:</strong> After the grace period, the backend detects when an auction has ended and submits a settlement transaction that computes the clearing price on-chain.
                    <br /><br />
                    <strong>Step 2 &mdash; Distribution:</strong> Immediately after settlement, the backend submits a single batch transaction that distributes tokens to every participant:
                    <br /><br />
                    &bull; <strong>Winners</strong> receive their purchased auction tokens directly to their wallet.<br />
                    &bull; <strong>Losing bidders</strong> (below the clearing price) receive a full refund of their bidding tokens.<br />
                    &bull; <strong>Failed auctions</strong> (below the funding threshold) &mdash; all bidders receive full refunds and the auctioneer&apos;s tokens are returned.
                    <br /><br />
                    The entire process costs only <strong>two BTC gas transactions total</strong>, regardless of the number of bidders. The smart contract loops through all orders in a single execution and transfers directly to each participant&apos;s address. There is no per-bidder gas cost and no need for bidders to manually claim tokens.
                    <br /><br />
                    <strong>The BTC gas cost for both transactions is paid by the Opnosis protocol</strong> &mdash; neither the auctioneer nor the bidders are charged for settlement or distribution.
                </>,
            },
            {
                id: 'open-source',
                q: 'Is the smart contract open source?',
                a: <>
                    Yes. The entire Opnosis Auction codebase &mdash; smart contracts, frontend, and backend &mdash; is publicly available on{' '}
                    <a
                        href="https://github.com/bobopnet/opnosis"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: color.purpleLight, textDecoration: 'underline' }}
                    >
                        GitHub
                    </a>. You can audit every line of code yourself.
                </>,
            },
        ],
    },
    {
        title: 'Legal',
        items: [
            {
                q: 'Is Opnosis Auction available in my country?',
                a: <>
                    Opnosis Auction is permissionless software deployed on a public blockchain. However, laws governing digital assets and token sales vary widely by jurisdiction and change frequently.
                    <br /><br />
                    Users from <strong>OFAC-sanctioned regions</strong> (including but not limited to North Korea, Iran, Cuba, Syria, Crimea, and others on the U.S. sanctions list) are prohibited from using the platform.
                    <br /><br />
                    Additionally, several countries have <strong>banned or heavily restricted</strong> cryptocurrency activity, including China, Algeria, Bangladesh, Nepal, Morocco, Egypt, Tunisia, and others. This list is not exhaustive and regulations evolve.
                    <br /><br />
                    <strong>You are solely responsible for determining whether using Opnosis Auction is lawful in your jurisdiction.</strong> If you are unsure, please consult a qualified legal professional before participating.
                </>,
            },
            {
                q: 'Is this financial or investment advice?',
                a: 'No. Opnosis Auction is software infrastructure, not a financial service. Nothing on this platform constitutes financial, investment, tax, or legal advice. Token auctions involve substantial risk, including the risk of total loss. You should do your own research and consult qualified professionals before making any financial decisions.',
            },
            {
                q: 'What are the risks?',
                a: <>
                    Participating in token auctions carries significant risks, including but not limited to:
                    <br /><br />
                    &bull; <strong>Smart contract risk</strong> &mdash; Despite being open source, the code may contain undiscovered bugs.<br />
                    &bull; <strong>Market risk</strong> &mdash; Token prices are volatile and you may lose some or all of your funds.<br />
                    &bull; <strong>Regulatory risk</strong> &mdash; Laws may change, potentially affecting your ability to use the platform or your tokens.<br />
                    &bull; <strong>Irreversibility</strong> &mdash; Blockchain transactions cannot be undone once confirmed.
                    <br /><br />
                    The platform is provided <strong>&ldquo;as is&rdquo;</strong> without warranty of any kind. Use at your own risk.
                </>,
            },
        ],
    },
];

/* ── Component ─────────────────────────────────────────────────────── */

function FAQItem({ id, q, a, forceOpen }: QA & { forceOpen?: boolean }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (forceOpen) {
            setOpen(true);
            setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
    }, [forceOpen]);

    return (
        <div ref={ref} id={id} style={s.item} onClick={() => setOpen((v) => !v)}>
            <div style={s.question(open)}>
                <span>{q}</span>
                <span style={s.chevron(open)}>&#9660;</span>
            </div>
            {open && <div style={s.answer}>{a}</div>}
        </div>
    );
}

export function FAQ({ initialQuestion }: { initialQuestion?: string | undefined }) {
    return (
        <div style={s.container}>
            <div style={s.title}>Frequently Asked Questions</div>
            <div style={s.subtitle}>
                Everything you need to know about batch auctions on Bitcoin.
            </div>

            {sections.map((sec) => (
                <div key={sec.title} style={s.section}>
                    <div style={s.sectionHeader}>{sec.title}</div>
                    {sec.items.map((item) => (
                        <FAQItem key={item.q} {...item} forceOpen={!!initialQuestion && item.id === initialQuestion} />
                    ))}
                </div>
            ))}
        </div>
    );
}
