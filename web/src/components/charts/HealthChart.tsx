"use client";

import { scaleLinear, scaleUtc } from "d3-scale";
import { line as d3line } from "d3-shape";
import { useMemo, useState } from "react";

import { labColor } from "@/lib/palette";
import { useWidth } from "./useWidth";

export interface Series {
  lab: string;
  name: string;
  slot?: number | null;
  values: (number | null)[];
  color?: string; // overrides the lab slot color (e.g. component lines on a lab page)
}

const colorOf = (s: Series) => s.color ?? labColor(s.lab);

interface Props {
  dates: string[];
  series: Series[];
  initial: string[];
  height?: number;
  metric?: string;
  domain?: [number, number];
  fmt?: (v: number) => string;
}

const M = { top: 12, right: 112, bottom: 28, left: 36 };

export function HealthChart({ dates, series, initial, height = 360, metric = "Health", domain = [0, 100], fmt = (v) => v.toFixed(1) }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [shown, setShown] = useState<string[]>(initial);
  const [hover, setHover] = useState<number | null>(null);

  const narrow = width < 560;
  const m = { ...M, right: narrow ? 12 : M.right };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const t = useMemo(() => dates.map((d) => new Date(`${d}T00:00:00Z`)), [dates]);
  const x = scaleUtc().domain([t[0], t[t.length - 1]]).range([0, iw]);
  const y = scaleLinear().domain(domain).range([ih, 0]).nice();
  const visible = series.filter((s) => shown.includes(s.lab));
  const path = d3line<number | null>()
    .digits(2)
    .defined((v) => v != null)
    .x((_, i) => x(t[i]))
    .y((v) => y(v as number));

  // End labels: place at last value, then resolve collisions with leader lines.
  const ends = visible
    .map((s) => {
      let i = s.values.length - 1;
      while (i >= 0 && s.values[i] == null) i--;
      return i < 0 ? null : { s, i, v: s.values[i] as number, y: y(s.values[i] as number) };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.y - b.y);
  const gap = 14;
  const placed = ends.map((e) => ({ ...e, ly: e.y }));
  for (let k = 1; k < placed.length; k++) {
    if (placed[k].ly - placed[k - 1].ly < gap) placed[k].ly = placed[k - 1].ly + gap;
  }
  const overflow = placed.length ? placed[placed.length - 1].ly - ih : 0;
  if (overflow > 0) placed.forEach((p) => (p.ly -= overflow));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const date = x.invert(px);
    let best = 0;
    for (let i = 1; i < t.length; i++) if (Math.abs(+t[i] - +date) < Math.abs(+t[best] - +date)) best = i;
    setHover(best);
  };

  const toggle = (lab: string) =>
    setShown((cur) => (cur.includes(lab) ? cur.filter((l) => l !== lab) : [...cur, lab]));

  const ticks = x.ticks(narrow ? 4 : 8);
  const hoverRows =
    hover == null
      ? []
      : visible
          .map((s) => ({ s, v: s.values[hover] }))
          .filter((r) => r.v != null)
          .sort((a, b) => (b.v as number) - (a.v as number));
  const tipLeft = hover == null ? 0 : x(t[hover]) + m.left;
  const tipFlip = tipLeft > width - 200;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Labs shown">
        {series.map((s) => {
          const on = shown.includes(s.lab);
          return (
            <button
              key={s.lab}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.lab)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on ? "border-rule bg-raised text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: on ? colorOf(s) : "var(--axis)" }} />
              {s.name}
            </button>
          );
        })}
      </div>
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="viz block h-auto max-w-full" role="img" aria-label={`${metric} over time`}>
          <g transform={`translate(${m.left},${m.top})`}>
            <g className="grid">
              {y.ticks(5).map((v) => (
                <g key={v} transform={`translate(0,${y(v)})`}>
                  <line x1={0} x2={iw} />
                  <text x={-8} dy="0.32em" textAnchor="end">{v}</text>
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
              <path
                key={s.lab}
                d={path(s.values) ?? ""}
                fill="none"
                stroke={colorOf(s)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={hover == null ? 1 : 0.9}
              />
            ))}
            {!narrow &&
              placed.map((p) => (
                <g key={p.s.lab}>
                  <circle cx={x(t[p.i])} cy={p.y} r={4} fill={colorOf(p.s)} stroke="var(--surface)" strokeWidth={2} />
                  {Math.abs(p.ly - p.y) > 1 && (
                    <line x1={x(t[p.i]) + 6} x2={iw + 10} y1={p.y} y2={p.ly} stroke="var(--axis)" strokeWidth={1} />
                  )}
                  <text x={iw + 12} y={p.ly} dy="0.32em" style={{ fill: "var(--ink-2)", fontSize: 12 }}>
                    {p.s.name}{" "}
                    <tspan style={{ fill: "var(--ink)", fontWeight: 600 }}>{fmt(p.v)}</tspan>
                  </text>
                </g>
              ))}
            {hover != null && (
              <g>
                <line x1={x(t[hover])} x2={x(t[hover])} y1={0} y2={ih} stroke="var(--axis)" strokeWidth={1} />
                {hoverRows.map(({ s, v }) => (
                  <circle key={s.lab} cx={x(t[hover])} cy={y(v as number)} r={4} fill={colorOf(s)} stroke="var(--surface)" strokeWidth={2} />
                ))}
              </g>
            )}
            <rect
              width={iw}
              height={ih}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              style={{ touchAction: "pan-y" }}
            />
          </g>
        </svg>
        {hover != null && hoverRows.length > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[170px] rounded-lg border border-rule bg-raised px-3 py-2 text-xs shadow-lg"
            style={{ left: tipFlip ? undefined : tipLeft + 12, right: tipFlip ? width - tipLeft + 12 : undefined }}
          >
            <p className="mb-1.5 font-medium text-ink">
              {t[hover].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
            </p>
            {hoverRows.map(({ s, v }) => (
              <p key={s.lab} className="flex items-center justify-between gap-4 py-px">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: colorOf(s) }} />
                  {s.name}
                </span>
                <span className="tabular font-medium text-ink">{fmt(v as number)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
