"use client";

import { scaleLinear, scaleUtc } from "d3-scale";
import { line as d3line } from "d3-shape";
import { useMemo, useState } from "react";

import { labColor } from "@/lib/palette";
import { LabPicker } from "./LabPicker";
import { useTween } from "./useTween";
import { useWidth } from "./useWidth";

export interface Series {
  lab: string;
  name: string;
  values: (number | null)[];
  color?: string; // overrides the lab color (e.g. pillar lines on a lab page)
  logo?: boolean; // show the lab logo in the picker (default true)
}

const colorOf = (s: Series) => s.color ?? labColor(s.lab);

interface Props {
  dates: string[];
  series: Series[]; // in rank order: the picker's "Top N" presets use this order
  initial?: string[];
  /** Controlled selection (lets a parent keep it across metric switches). */
  shown?: string[];
  onShownChange?: (next: string[]) => void;
  height?: number;
  metric?: string;
  domain?: [number, number];
  fmt?: (v: number) => string;
  presets?: boolean;
}

const M = { top: 14, right: 132, bottom: 28, left: 40 };
const MAX_END_LABELS = 8; // beyond this, end labels collide; the tooltip and picker carry identity
const MAX_TIP_ROWS = 12;

export function HealthChart({
  dates,
  series,
  initial = [],
  shown: shownProp,
  onShownChange,
  height = 360,
  metric = "Health",
  domain = [0, 100],
  fmt = (v) => v.toFixed(1),
  presets = true,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [shownLocal, setShownLocal] = useState<string[]>(initial);
  const shown = shownProp ?? shownLocal;
  const setShown = onShownChange ?? setShownLocal;
  const [hover, setHover] = useState<number | null>(null);

  const narrow = width < 560;
  const m = { ...M, right: narrow ? 14 : M.right };
  const iw = Math.max(10, width - m.left - m.right);
  const ih = height - m.top - m.bottom;
  const t = useMemo(() => dates.map((d) => new Date(`${d}T00:00:00Z`)), [dates]);
  const x = scaleUtc().domain([t[0], t[t.length - 1]]).range([0, iw]);
  const y = scaleLinear().domain(domain).range([ih, 0]).nice();
  // keep picker order (rank order) for drawing too, so the leader is painted last (on top)
  const visible = series.filter((s) => shown.includes(s.lab)).reverse();

  // Tween in pixel space so lines glide between metrics even when the axis range changes.
  const targetPx: Record<string, (number | null)[]> = {};
  for (const s of visible) targetPx[s.lab] = s.values.map((v) => (v == null ? null : +y(v).toFixed(2)));
  const px = useTween(targetPx);

  const path = d3line<number | null>()
    .digits(2)
    .defined((v) => v != null)
    .x((_, i) => x(t[i]))
    .y((v) => v as number);

  // End labels (only when few enough to place): stack to avoid collisions, clamp to the plot.
  const ends = visible
    .map((s) => {
      let i = s.values.length - 1;
      while (i >= 0 && s.values[i] == null) i--;
      const py = px[s.lab]?.[i] ?? targetPx[s.lab]?.[i];
      return i < 0 || py == null ? null : { s, i, v: s.values[i] as number, y: py };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.y - b.y);
  const showEnds = !narrow && ends.length <= MAX_END_LABELS;
  const gap = 15;
  const placed = ends.map((e) => ({ ...e, ly: e.y }));
  for (let k = 1; k < placed.length; k++) {
    if (placed[k].ly - placed[k - 1].ly < gap) placed[k].ly = placed[k - 1].ly + gap;
  }
  const overflow = placed.length ? placed[placed.length - 1].ly - ih : 0;
  if (overflow > 0) placed.forEach((p) => (p.ly = Math.max(0, p.ly - overflow)));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const date = x.invert(((e.clientX - box.left) / box.width) * iw);
    let best = 0;
    for (let i = 1; i < t.length; i++) if (Math.abs(+t[i] - +date) < Math.abs(+t[best] - +date)) best = i;
    setHover(best);
  };

  const ticks = x.ticks(narrow ? 4 : 8);
  const hoverRows =
    hover == null
      ? []
      : visible
          .map((s) => ({ s, v: s.values[hover] }))
          .filter((r): r is { s: Series; v: number } => r.v != null)
          .sort((a, b) => b.v - a.v);
  const tipLeft = hover == null ? 0 : x(t[hover]) + m.left;
  const tipFlip = tipLeft > width - 220;

  return (
    <div>
      <LabPicker
        options={series.map((s) => ({ lab: s.lab, name: s.name, color: s.color, logo: s.logo }))}
        selected={shown}
        onChange={setShown}
        presets={presets}
      />
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="viz block h-auto max-w-full" role="img" aria-label={`${metric} over time`}>
          <g transform={`translate(${m.left},${m.top})`}>
            <g className="grid">
              {y.ticks(5).map((v) => (
                <g key={v} transform={`translate(0,${y(v)})`} className="transition-transform duration-500">
                  <line x1={0} x2={iw} />
                  <text x={-8} dy="0.32em" textAnchor="end">{fmt(v).replace(/\.0$/, "")}</text>
                </g>
              ))}
            </g>
            <line className="axis-line" x1={0} x2={iw} y1={ih} y2={ih} />
            {ticks.map((d) => (
              <text key={+d} x={x(d)} y={ih + 18} textAnchor="middle">
                {d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}
              </text>
            ))}
            {visible.map((s) => (
              // pathLength=1 lets the draw-in animation run on any line when it first appears
              <path
                key={s.lab}
                d={path(px[s.lab] ?? targetPx[s.lab] ?? []) ?? ""}
                pathLength={1}
                className="draw-in"
                fill="none"
                stroke={colorOf(s)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {showEnds &&
              placed.map((p) => (
                <g key={p.s.lab} className="fade-in-late">
                  <circle cx={x(t[p.i])} cy={p.y} r={4} fill={colorOf(p.s)} stroke="var(--surface)" strokeWidth={2} />
                  {Math.abs(p.ly - p.y) > 1 && <line x1={x(t[p.i]) + 6} x2={iw + 10} y1={p.y} y2={p.ly} stroke="var(--axis)" strokeWidth={1} />}
                  <text x={iw + 12} y={p.ly} dy="0.32em" style={{ fill: "var(--ink-2)", fontSize: 12 }}>
                    {p.s.name.length > 13 ? `${p.s.name.slice(0, 12)}…` : p.s.name}{" "}
                    <tspan style={{ fill: "var(--ink)", fontWeight: 600 }}>{fmt(p.v)}</tspan>
                  </text>
                </g>
              ))}
            {hover != null && (
              <g pointerEvents="none">
                <line x1={x(t[hover])} x2={x(t[hover])} y1={0} y2={ih} stroke="var(--axis)" strokeWidth={1} />
                {hoverRows.map(({ s }) => {
                  const py = px[s.lab]?.[hover];
                  return py == null ? null : <circle key={s.lab} cx={x(t[hover])} cy={py} r={4} fill={colorOf(s)} stroke="var(--surface)" strokeWidth={2} />;
                })}
              </g>
            )}
            {visible.length === 0 && (
              <text x={iw / 2} y={ih / 2} textAnchor="middle" style={{ fontSize: 13 }}>
                Select a lab above to plot it
              </text>
            )}
            <rect width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }} />
          </g>
        </svg>
        {hover != null && hoverRows.length > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[190px] rounded-lg border border-rule bg-raised px-3 py-2 text-xs shadow-lg"
            style={{ left: tipFlip ? undefined : tipLeft + 14, right: tipFlip ? width - tipLeft + 14 : undefined }}
          >
            <p className="mb-1.5 font-medium text-ink">
              {t[hover].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
            </p>
            {hoverRows.slice(0, MAX_TIP_ROWS).map(({ s, v }) => (
              <p key={s.lab} className="flex items-center justify-between gap-4 py-px">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: colorOf(s) }} />
                  {s.name}
                </span>
                <span className="tabular font-medium text-ink">{fmt(v)}</span>
              </p>
            ))}
            {hoverRows.length > MAX_TIP_ROWS && <p className="mt-1 text-ink-3">+{hoverRows.length - MAX_TIP_ROWS} more</p>}
          </div>
        )}
      </div>
    </div>
  );
}
