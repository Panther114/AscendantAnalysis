"use client";

import { scaleLinear, scaleUtc } from "d3-scale";
import { useState } from "react";

import { useWidth } from "./useWidth";

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface TimelinePoint {
  slug: string;
  name: string;
  date: string;
  line: string;
  tier: string | null;
  competitiveness: number;
  material: boolean;
  intelligence: number;
}

const TIER_Y_LABEL: Record<string, string> = { frontier: "Frontier", mid: "Mid", small: "Small" };

/** At-release competitiveness of each release; lines connect successors in a product line. */
export function ReleaseTimeline({ points, color, start, end }: { points: TimelinePoint[]; color: string; start: string; end: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<TimelinePoint | null>(null);
  const height = 260;
  const m = { top: 14, right: 16, bottom: 28, left: 40 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const x = scaleUtc().domain([new Date(`${start}T00:00:00Z`), new Date(`${end}T00:00:00Z`)]).range([0, iw]);
  const y = scaleLinear().domain([0, 1]).range([ih, 0]);
  const px = (p: TimelinePoint) => r2(x(new Date(`${p.date}T00:00:00Z`)));
  const lines = new Map<string, TimelinePoint[]>();
  for (const p of points.filter((p) => p.material)) lines.set(p.line, [...(lines.get(p.line) ?? []), p]);

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="viz block h-auto max-w-full" role="img" aria-label="At-release competitiveness of each release">
        <g transform={`translate(${m.left},${m.top})`}>
          <g className="grid">
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v} transform={`translate(0,${y(v)})`}>
                <line x1={0} x2={iw} />
                <text x={-8} dy="0.32em" textAnchor="end">{Math.round(v * 100)}</text>
              </g>
            ))}
          </g>
          {x.ticks(width < 560 ? 4 : 7).map((d) => (
            <text key={+d} x={x(d)} y={ih + 18} textAnchor="middle">
              {d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}
            </text>
          ))}
          {[...lines.values()].filter((ps) => ps.length > 1).map((ps) => (
            <path
              key={ps[0].line}
              d={ps.map((p, i) => `${i ? "L" : "M"}${px(p)},${y(p.competitiveness)}`).join("")}
              fill="none"
              stroke={color}
              strokeOpacity={0.45}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}
          {points.map((p) => (
            <circle
              key={p.slug}
              cx={px(p)}
              cy={y(p.competitiveness)}
              r={p.material ? 5 : 4}
              fill={p.material ? color : "var(--surface)"}
              stroke={p.material ? "var(--surface)" : color}
              strokeWidth={2}
              onPointerEnter={() => setHover(p)}
              onPointerLeave={() => setHover(null)}
              style={{ cursor: "default" }}
            />
          ))}
        </g>
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-[220px] rounded-lg border border-rule bg-raised px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(px(hover) + m.left + 12, width - 232), top: Math.max(0, y(hover.competitiveness) + m.top - 24) }}
        >
          <p className="font-medium text-ink">{hover.name}</p>
          <p className="mb-1 text-ink-3">
            {new Date(`${hover.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
            {hover.tier && <> · {TIER_Y_LABEL[hover.tier]} tier</>}
          </p>
          <p className="flex justify-between"><span className="text-ink-3">At-release competitiveness</span><span className="tabular text-ink">{Math.round(hover.competitiveness * 100)}</span></p>
          <p className="flex justify-between"><span className="text-ink-3">Intelligence</span><span className="tabular text-ink">{hover.intelligence.toFixed(1)}</span></p>
          <p className="mt-1 text-ink-3">{hover.material ? "Material release" : "Minor release (doesn't reset freshness)"}</p>
        </div>
      )}
      <div className="mt-1 flex gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />Material release</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: color }} />Minor release</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: color, opacity: 0.45 }} />Same product line</span>
      </div>
    </div>
  );
}
