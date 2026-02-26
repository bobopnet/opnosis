import { useState } from 'react';
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
            <tr><td style={s.tdField}>Min Buy Amount</td><td style={s.td}>Minimum total bids you will accept. Sets the reserve price.</td></tr>
            <tr><td style={s.tdField}>Min Bid Per Order</td><td style={s.td}>Smallest individual bid allowed. Prevents dust bids.</td></tr>
            <tr><td style={s.tdField}>Min Funding Threshold</td><td style={s.td}>Minimum number of bidding tokens the auctioneer expects to receive. If not met, the auction fails and all tokens are returned. 0 = disabled.</td></tr>
            <tr><td style={s.tdField}>Cancel Window</td><td style={s.td}>Minutes during which bidders can cancel. After this, bids are final.</td></tr>
            <tr><td style={s.tdField}>Auction Duration</td><td style={s.td}>Minutes the auction accepts bids before settlement.</td></tr>
            <tr><td style={s.tdField}>Atomic Closure</td><td style={s.td}>When enabled, anyone can settle once enough bids clear.</td></tr>
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
                q: 'Who can use Opnosis Auction \u2014 is it only for institutions?',
                a: <>
                    Opnosis is permissionless software. Anyone with an OP_WALLET &mdash; retail users, projects, DAOs, or institutions &mdash; can create auctions and place bids. There are no KYC requirements, minimum balances, or whitelists.
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
                a: 'Opnosis exclusively supports OP_WALLET, the browser extension wallet for the OPNet ecosystem. MetaMask and other Ethereum wallets are not compatible.',
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
                q: 'What is the protocol fee?',
                a: 'Opnosis charges a small fee on the sell amount, deducted automatically at settlement. The exact percentage is displayed on the Create page. No fee is charged if the auction fails to meet its funding threshold.',
            },
            {
                q: 'What happens if the minimum funding threshold isn\u2019t met?',
                a: 'The auction is considered unsuccessful. All bidding tokens are returned to bidders, and the auctioneer\u2019s sell tokens are returned. No fees are charged.',
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
                q: 'How is the clearing price determined?',
                a: 'After the auction ends, bids are sorted from highest to lowest price. The algorithm walks down the sorted list until all sell tokens are allocated. The price of the last winning bid becomes the clearing price, and every winner pays this same price.',
            },
            {
                q: 'How do I claim my tokens after settlement?',
                a: 'Once the auction is settled, go to the auction detail page. If you are a winning bidder, a "Claim" button will appear. Click it to receive your purchased tokens. If your bid did not win, you can claim a refund of your bidding tokens.',
            },
        ],
    },
    {
        title: 'Technical',
        items: [
            {
                q: 'What network does Opnosis run on?',
                a: 'Opnosis runs on OPNet, a smart-contract layer on Bitcoin Layer 1. Transactions are secured by Bitcoin\u2019s proof-of-work consensus. The platform supports both testnet and mainnet.',
            },
            {
                q: 'Is the smart contract open source?',
                a: <>
                    Yes. The entire Opnosis codebase &mdash; smart contracts, frontend, and backend &mdash; is publicly available on{' '}
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
                q: 'Is Opnosis available in my country?',
                a: <>
                    Opnosis is permissionless software deployed on a public blockchain. However, laws governing digital assets and token sales vary widely by jurisdiction and change frequently.
                    <br /><br />
                    Users from <strong>OFAC-sanctioned regions</strong> (including but not limited to North Korea, Iran, Cuba, Syria, Crimea, and others on the U.S. sanctions list) are prohibited from using the platform.
                    <br /><br />
                    Additionally, several countries have <strong>banned or heavily restricted</strong> cryptocurrency activity, including China, Algeria, Bangladesh, Nepal, Morocco, Egypt, Tunisia, and others. This list is not exhaustive and regulations evolve.
                    <br /><br />
                    <strong>You are solely responsible for determining whether using Opnosis is lawful in your jurisdiction.</strong> If you are unsure, please consult a qualified legal professional before participating.
                </>,
            },
            {
                q: 'Is this financial or investment advice?',
                a: 'No. Opnosis is software infrastructure, not a financial service. Nothing on this platform constitutes financial, investment, tax, or legal advice. Token auctions involve substantial risk, including the risk of total loss. You should do your own research and consult qualified professionals before making any financial decisions.',
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

function FAQItem({ q, a }: QA) {
    const [open, setOpen] = useState(false);

    return (
        <div style={s.item} onClick={() => setOpen((v) => !v)}>
            <div style={s.question(open)}>
                <span>{q}</span>
                <span style={s.chevron(open)}>&#9660;</span>
            </div>
            {open && <div style={s.answer}>{a}</div>}
        </div>
    );
}

export function FAQ() {
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
                        <FAQItem key={item.q} q={item.q} a={item.a} />
                    ))}
                </div>
            ))}
        </div>
    );
}
