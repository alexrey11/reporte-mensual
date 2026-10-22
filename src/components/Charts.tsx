import { useMemo } from 'react';

/* ---------- Donut / Ring chart ---------- */
export function DonutChart({
    data, size = 200, thickness = 26, centerLabel, centerValue,
}: {
    data: { label: string; value: number; color: string }[];
    size?: number; thickness?: number; centerLabel?: string; centerValue?: string;
}) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
                {data.map((d, i) => {
                    const len = (d.value / total) * circumference;
                    const dash = `${len} ${circumference - len}`;
                    const el = (
                        <circle
                            key={i}
                            cx={size / 2} cy={size / 2} r={radius}
                            fill="none" stroke={d.color} strokeWidth={thickness}
                            strokeDasharray={dash}
                            strokeDashoffset={-offset}
                            strokeLinecap="butt"
                            style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease' }}
                        />
                    );
                    offset += len;
                    return el;
                })}
            </svg>
            <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{centerLabel}</span>
                <span style={{ fontSize: 30, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{centerValue}</span>
            </div>
        </div>
    );
}

/* ---------- Barras verticales con animación ---------- */
export function BarChart({
    data, height = 220, color = '#0d9488',
}: { data: { label: string; value: number }[]; height?: number; color?: string }) {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height, paddingTop: 10 }}>
            {data.map((d, i) => {
                const h = (d.value / max) * (height - 30);
                return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`Día ${d.label}: ${d.value}`}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>{d.value || ''}</span>
                        <div style={{
                            width: '100%', maxWidth: 28, height: Math.max(h, 2),
                            background: `linear-gradient(180deg, ${color}, ${color}cc)`,
                            borderRadius: '6px 6px 2px 2px',
                            transition: 'height 0.5s ease',
                        }} />
                        <span style={{ fontSize: 8, color: '#94a3b8' }}>{d.label}</span>
                    </div>
                );
            })}
        </div>
    );
}

/* ---------- Barras horizontales (para estados / áreas) ---------- */
export function HBarChart({
    data, maxBars = 6,
}: { data: { label: string; value: number; color: string }[]; maxBars?: number }) {
    const items = useMemo(() => {
        const total = data.reduce((s, d) => s + d.value, 0) || 1;
        return [...data].sort((a, b) => b.value - a.value).slice(0, maxBars).map(d => ({
            ...d, pct: (d.value / total) * 100,
        }));
    }, [data, maxBars]);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((d, i) => (
                <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{d.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{d.value} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({d.pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{ height: 10, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                            width: `${d.pct}%`, height: '100%',
                            background: `linear-gradient(90deg, ${d.color}, ${d.color}bb)`,
                            borderRadius: 99, transition: 'width 0.6s ease',
                        }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ---------- Sparkline / área para tendencia ---------- */
export function AreaChart({
    data, width = 600, height = 140, color = '#0d9488',
}: { data: number[]; width?: number; height?: number; color?: string }) {
    const max = Math.max(...data, 1);
    const step = data.length > 1 ? width / (data.length - 1) : width;
    const pts = data.map((v, i) => `${i * step},${height - (v / max) * (height - 20) - 10}`);
    const linePath = `M${pts.join(' L')}`;
    const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#areaGrad)" />
            <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        </svg>
    );
}