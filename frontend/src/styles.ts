/**
 * Shared design tokens and reusable style helpers for the "Bitcoin Forge" theme.
 *
 * All components import from here instead of hardcoding hex values.
 */

/* ── Color Tokens ─────────────────────────────────────────────────── */

export const color = {
    bgDeep: '#0a0a12',
    bgSurface: '#141420',
    bgElevated: '#1e1e2e',
    borderSubtle: '#2a2a3d',
    borderStrong: '#3d3450',

    amber: '#e8941a',
    amberLight: '#f5b044',
    amberDim: '#b37215',
    purple: '#804095',
    purpleLight: '#b568d4',
    purpleDeep: '#3d1a4a',

    textPrimary: '#f0ece4',
    textSecondary: '#c0bbb0',
    textMuted: '#8a8478',

    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    white: '#ffffff',
} as const;

/* ── Typography ───────────────────────────────────────────────────── */

export const font = {
    display: "'Space Grotesk', sans-serif",
    body: "'IBM Plex Sans', sans-serif",
} as const;

/* ── Reusable Style Fragments ─────────────────────────────────────── */

export const card: React.CSSProperties = {
    background: color.bgSurface,
    borderRadius: '12px',
    padding: '24px',
    border: `1px solid ${color.borderSubtle}`,
    borderLeft: `4px solid ${color.amber}`,
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.3)',
    transition: 'transform 0.2s, box-shadow 0.2s',
};

export const cardHover: React.CSSProperties = {
    transform: 'translateY(-2px)',
    boxShadow: `0 8px 32px rgba(232, 148, 26, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4)`,
};

export const btnPrimary: React.CSSProperties = {
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    background: `linear-gradient(135deg, ${color.amber}, ${color.amberDim})`,
    color: color.white,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: font.display,
    cursor: 'pointer',
    boxShadow: `0 2px 12px rgba(232, 148, 26, 0.25)`,
    transition: 'opacity 0.2s, transform 0.15s, box-shadow 0.2s',
};

export const btnSecondary: React.CSSProperties = {
    padding: '12px 24px',
    borderRadius: '8px',
    border: `1px solid ${color.purple}`,
    background: `linear-gradient(135deg, ${color.purple}, ${color.purpleDeep})`,
    color: color.white,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: font.display,
    cursor: 'pointer',
    transition: 'border-color 0.2s, color 0.2s, background 0.2s',
};

export const btnDisabled: React.CSSProperties = {
    opacity: 0.45,
    cursor: 'not-allowed',
};

export const input: React.CSSProperties = {
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
};

export const inputFocus: React.CSSProperties = {
    borderColor: color.purpleLight,
    boxShadow: `0 0 0 3px rgba(155, 77, 187, 0.15)`,
};

export const badge = (variant: 'amber' | 'success' | 'muted' | 'purple'): React.CSSProperties => {
    const map = {
        amber: { bg: 'rgba(232, 148, 26, 0.15)', fg: color.amberLight },
        success: { bg: 'rgba(16, 185, 129, 0.15)', fg: color.success },
        muted: { bg: 'rgba(107, 101, 96, 0.2)', fg: color.textMuted },
        purple: { bg: 'rgba(107, 45, 123, 0.2)', fg: color.purpleLight },
    };
    const { bg, fg } = map[variant];
    return {
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: font.display,
        background: bg,
        color: fg,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
    };
};

export const label: React.CSSProperties = {
    color: color.textSecondary,
    fontSize: '15px',
    fontFamily: font.body,
    marginBottom: '6px',
    display: 'block',
};

export const sectionTitle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 600,
    fontFamily: font.display,
    color: color.textPrimary,
    marginBottom: '16px',
    paddingLeft: '12px',
    borderLeft: `3px solid ${color.amber}`,
};

export const statusMsg = (isError: boolean): React.CSSProperties => ({
    marginTop: '16px',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: font.body,
    background: isError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
    color: isError ? color.error : color.success,
    border: `1px solid ${isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
});

export const dismissBtn: React.CSSProperties = {
    marginLeft: '12px',
    background: 'none',
    border: 'none',
    color: color.textSecondary,
    cursor: 'pointer',
    textDecoration: 'underline',
    fontFamily: font.body,
    fontSize: '12px',
};
