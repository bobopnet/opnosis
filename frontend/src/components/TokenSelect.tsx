import { useState } from 'react';
import { KNOWN_TOKENS } from '@opnosis/shared';
import type { KnownToken } from '@opnosis/shared';
import {
    color, font,
    input as inputStyle, label as labelStyle,
} from '../styles.js';
import { HelpTip } from './HelpTip.js';

const CUSTOM_VALUE = '__custom__';

const s = {
    wrapper: {
        marginBottom: '16px',
    } as React.CSSProperties,
    select: {
        width: '100%',
        padding: '13px 14px',
        borderRadius: '8px',
        border: `1px solid ${color.borderSubtle}`,
        background: color.bgDeep,
        color: color.textPrimary,
        fontSize: '14px',
        fontFamily: font.body,
        outline: 'none',
        transition: 'border-color 0.2s',
        cursor: 'pointer',
        appearance: 'none' as const,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b6560' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
        paddingRight: '36px',
    } as React.CSSProperties,
    customInput: {
        ...inputStyle,
        marginTop: '8px',
    } as React.CSSProperties,
};

interface Props {
    readonly value: string;
    readonly onChange: (address: string) => void;
    readonly network: string;
    readonly label: string;
    readonly help?: string;
    /** Hide tokens marked as biddingOnly (e.g. for the auctioning token selector). */
    readonly excludeBiddingOnly?: boolean;
}

/** Filter tokens that have an address for the current network. */
function tokensForNetwork(network: string, excludeBiddingOnly?: boolean): KnownToken[] {
    return KNOWN_TOKENS.filter((t) => {
        if (excludeBiddingOnly && t.biddingOnly) return false;
        const addr = network === 'mainnet' ? t.mainnet : t.testnet;
        return addr.length > 0;
    });
}

/** Get the address for a token on the given network. */
function tokenAddress(token: KnownToken, network: string): string {
    return network === 'mainnet' ? token.mainnet : token.testnet;
}

export function TokenSelect({ value, onChange, network, label, help, excludeBiddingOnly }: Props) {
    const available = tokensForNetwork(network, excludeBiddingOnly);

    // Determine if current value matches a known token
    const matchedSymbol = available.find((t) => tokenAddress(t, network) === value)?.symbol ?? null;
    const isCustom = value.length > 0 && matchedSymbol === null;
    const [showCustom, setShowCustom] = useState(isCustom);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sel = e.target.value;
        if (sel === CUSTOM_VALUE) {
            setShowCustom(true);
            onChange('');
        } else if (sel === '') {
            setShowCustom(false);
            onChange('');
        } else {
            setShowCustom(false);
            onChange(sel);
        }
    };

    const selectValue = showCustom ? CUSTOM_VALUE : (matchedSymbol !== null ? value : '');

    return (
        <div style={s.wrapper}>
            <label style={labelStyle}>{label}{help && <HelpTip text={help} />}</label>
            <select
                style={s.select}
                value={selectValue}
                onChange={handleSelectChange}
            >
                <option value="">Select token...</option>
                {available.map((t) => {
                    const addr = tokenAddress(t, network);
                    return (
                        <option key={t.symbol} value={addr}>
                            {t.symbol} — {t.name}
                        </option>
                    );
                })}
                <option value={CUSTOM_VALUE}>Custom address</option>
            </select>
            {showCustom && (
                <input
                    style={s.customInput}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="0x..."
                />
            )}
        </div>
    );
}
