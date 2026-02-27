import { useState } from 'react';
import { color, font } from '../styles.js';

const s = {
    wrapper: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: '6px',
    } as React.CSSProperties,
    circle: {
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 700,
        fontFamily: font.display,
        background: color.purpleDeep,
        color: color.purpleLight,
        border: `1px solid ${color.purpleLight}`,
        cursor: 'help',
        lineHeight: 1,
        flexShrink: 0,
    } as React.CSSProperties,
    tooltip: {
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 14px',
        borderRadius: '8px',
        background: color.bgElevated,
        color: color.textSecondary,
        fontSize: '14px',
        fontFamily: font.body,
        lineHeight: 1.5,
        whiteSpace: 'normal',
        width: '270px',
        border: `1px solid ${color.borderStrong}`,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        zIndex: 20,
        pointerEvents: 'none',
    } as React.CSSProperties,
    arrow: {
        position: 'absolute',
        bottom: '-5px',
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: '8px',
        height: '8px',
        background: color.bgElevated,
        borderRight: `1px solid ${color.borderStrong}`,
        borderBottom: `1px solid ${color.borderStrong}`,
    } as React.CSSProperties,
};

interface Props {
    readonly text: string;
}

export function HelpTip({ text }: Props) {
    const [visible, setVisible] = useState(false);

    return (
        <span
            style={s.wrapper}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            <span style={s.circle}>?</span>
            {visible && (
                <div style={s.tooltip}>
                    {text}
                    <div style={s.arrow} />
                </div>
            )}
        </span>
    );
}
