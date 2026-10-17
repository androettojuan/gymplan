import { useRef, useState } from "react";
import { fmtDate, fmtW } from "../lib/format";

export interface ChartPoint { d: string; w: number; r?: string }

const dayMs = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const niceStep = (r: number) => { const p = 10 ** Math.floor(Math.log10(r)); const m = r / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

// One series over real time: recessive grid, 2px line, ringed dots, last value labelled, tap or hover for each point.
export function LineChart({ points, label }: { points: ChartPoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 340, H = 180, L = 36, R = 14, T = 22, B = 24;
  const xs = points.map(p => dayMs(p.d)), ws = points.map(p => p.w);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
  let lo = Math.min(...ws), hi = Math.max(...ws);
  const pad = (hi - lo) * 0.15 || Math.max(1, hi * 0.04);
  lo -= pad; hi += pad;
  const step = niceStep((hi - lo) / 3);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const X = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const xy = points.map((p, i) => [X(xs[i]), Y(p.w)] as const);
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${H - B} L${xy[0][0].toFixed(1)} ${H - B} Z`;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  const xIdx = [...new Set(points.length > 4 ? [0, Math.round((points.length - 1) / 2), points.length - 1] : [0, points.length - 1])];
  const last = xy[xy.length - 1];

  const onMove = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect(); if (!r) return;
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    xy.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(xy[best][0] - x)) best = i; });
    setHover(best);
  };
  const tipLeft = hover == null ? 0 : (xy[hover][0] / W) * 100;

  return (
    <div className="chart" onPointerMove={e => onMove(e.clientX)} onPointerDown={e => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: de ${fmtW(ws[0])} a ${fmtW(ws[ws.length - 1])} kg`}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 6} y={Y(v) + 3.5} textAnchor="end" className="ax">{fmtW(v)}</text>
          </g>
        ))}
        <path d={area} fill="var(--accent-soft)" opacity=".7" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 6 : 4} fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />)}
        <text x={Math.min(last[0], W - R)} y={last[1] - 10} textAnchor="end" className="val">{fmtW(ws[ws.length - 1])} kg</text>
        {xIdx.map((i, k) => (
          <text key={i} x={xy[i][0]} y={H - 6} className="ax"
            textAnchor={xIdx.length > 1 && k === 0 ? "start" : xIdx.length > 1 && k === xIdx.length - 1 ? "end" : "middle"}>{fmtDate(points[i].d)}</text>
        ))}
        {hover != null && <line x1={xy[hover][0]} x2={xy[hover][0]} y1={T - 6} y2={H - B} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `clamp(0px, calc(${tipLeft}% - 60px), calc(100% - 140px))` }}>
          {fmtDate(points[hover].d)} · {fmtW(points[hover].w)} kg{points[hover].r ? ` · ${points[hover].r} reps` : ""}
        </div>
      )}
    </div>
  );
}

export function Delta({ from, to }: { from: number; to: number }) {
  const d = to - from;
  return <span className={`delta num ${d > 0 ? "up" : ""}`}>{d > 0 ? "+" : ""}{fmtW(d)} kg</span>;
}
