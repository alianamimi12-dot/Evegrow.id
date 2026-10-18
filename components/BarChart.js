export default function BarChart({ data, format = (v) => v, color = "var(--brand)", label = "Grafik" }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 640, H = 200, pad = 14;
  const bw = (W - pad * 2) / Math.max(1, data.length);
  const step = Math.ceil(data.length / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} role="img" aria-label={label} className="chart">
      {[0, 0.5, 1].map((t) => <line key={t} x1={pad} x2={W - pad} y1={H - t * (H - 16)} y2={H - t * (H - 16)} className="grid-line" />)}
      {data.map((d, i) => {
        const h = (d.value / max) * (H - 16);
        const x = pad + i * bw + bw * 0.18;
        return (
          <g key={i}>
            <rect x={x} y={H - h} width={bw * 0.64} height={d.value > 0 ? Math.max(h, 3) : 0} rx="4" fill={color}><title>{d.label}: {format(d.value)}</title></rect>
            {i % step === 0 && <text x={x + bw * 0.32} y={H + 18} textAnchor="middle" className="axis">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}
