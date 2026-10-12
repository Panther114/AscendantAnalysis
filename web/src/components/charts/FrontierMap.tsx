"use client";

import { scaleLinear, scaleLog } from "d3-scale";
import { useMemo, useState } from "react";

import { labColor } from "@/lib/palette";
import type { OwnershipLevel, ReleaseOut } from "@/lib/types";
import { LabPicker } from "./LabPicker";
import { useWidth } from "./useWidth";

interface Pt {
  x: number;
  y: number;
  lab: string;
  release: ReleaseOut;
  v: ReleaseOut["variants"][number];
}

interface Props {
  releases: ReleaseOut[];
  names: Record<string, string>;
  choices: string[];
  initial: string[];
  ownership: OwnershipLevel[];
}

// Scatter is an all-pairs comparison, so cap highlighted series at 3; each highlighted lab also
// carries a direct label (secondary encoding) because brand colors can sit close in hue.
const MAX_HIGHLIGHT = 3;

const r2 = (v: number) => Math.round(v * 100) / 100;

function usd(x: number) {
  if (x >= 10) return `$${x.toFixed(0)}`;
  if (x >= 1) return `$${x.toFixed(1)}`;
  if (x >= 0.1) return `$${x.toFixed(2)}`;
  return `$${x.toPrecision(1)}`;
}

export function FrontierMap({ releases, names, choices, initial, ownership }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hl, setHl] = useState<string[]>(initial.slice(0, MAX_HIGHLIGHT));
  const [hover, setHover] = useState<Pt | null>(null);
  const [cell, setCell] = useState<OwnershipLevel | null>(null);

  const pts = useMemo<Pt[]>(
    () =>
      releases.flatMap((r) =>
        r.variants.filter((v) => v.cost != null).map((v) => ({ x: v.cost as number, y: v.intelligence, lab: r.lab, release: r, v })),
      ),
    [releases],
  );

  const height = width < 560 ? 380 : 500;
  const m = { top: 16, right: 24, bottom: 44, left: 44 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const xs = pts.map((p) => p.x);
  const xs0 = scaleLog().domain([Math.min(...xs) * 0.8, Math.max(...xs) * 1.25]).range([0, iw]);
  const ys0 = scaleLinear().domain([0, Math.ceil((Math.max(...pts.map((p) => p.y)) + 4) / 10) * 10]).range([ih, 0]);
  // Round to 2dp: Math.log can differ in the last bit between Node and browsers (hydration).
  const x = Object.assign((v: number) => r2(xs0(v)), { domain: () => xs0.domain(), invert: (v: number) => xs0.invert(v) });
  const y = Object.assign((v: number) => r2(ys0(v)), { ticks: (n: number) => ys0.ticks(n) });

  // Field Pareto frontier: walking up in cost, keep points that raise the best intelligence.
  const frontier = useMemo(() => {
    const sorted = [...pts].sort((a, b) => a.x - b.x || b.y - a.y);
    const out: Pt[] = [];
    let best = -Infinity;
    for (const p of sorted) if (p.y > best) { out.push(p); best = p.y; }
    return out;
  }, [pts]);
  const stair = frontier
    .map((p, i) => (i === 0 ? `M${x(p.x)},${y(p.y)}` : `H${x(p.x)}V${y(p.y)}`))
    .join("");

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    // Convert screen pixels to chart units: the SVG may be scaled to fit (viewBox).
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * iw;
    const py = ((e.clientY - box.top) / box.height) * ih;
    let best: Pt | null = null;
    let bd = 16 * 16;
    for (const p of pts) {
      const dx = x(p.x) - px;
      const dy = y(p.y) - py;
      const d = dx * dx + dy * dy;
      const boost = hl.includes(p.lab) ? 0.6 : 1; // prefer highlighted marks
      if (d * boost < bd) { bd = d * boost; best = p; }
    }
    setHover(best);
  };

  const highlightedReleases = releases.filter((r) => hl.includes(r.lab));
  const xTicks = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30].filter((t) => t >= x.domain()[0] && t <= x.domain()[1]);

  // label each highlighted lab's top release once, at its best variant
  const labels = hl
    .map((lab) => {
      const rs = highlightedReleases.filter((r) => r.lab === lab && r.variants.some((v) => v.cost != null));
      if (!rs.length) return null;
      const top = rs.reduce((a, b) => (b.intelligence > a.intelligence ? b : a));
      const v = top.variants.filter((v) => v.cost != null).reduce((a, b) => (b.intelligence > a.intelligence ? b : a));
      return { lab, text: top.name, px: x(v.cost as number), py: y(v.intelligence) };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const levels = [...ownership].reverse(); // low -> high intelligence, left -> right
  const cw = iw / levels.length;

  return (
    <div>
      <LabPicker
        options={choices.map((lab) => ({ lab, name: names[lab] ?? lab }))}
        selected={hl}
        onChange={setHl}
        max={MAX_HIGHLIGHT}
        label="Highlight"
      />

      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="viz block h-auto max-w-full" role="img" aria-label="Intelligence versus cost for every active model variant">
          <g transform={`translate(${m.left},${m.top})`}>
            <g className="grid">
              {y.ticks(6).map((v) => (
                <g key={v} transform={`translate(0,${y(v)})`}>
                  <line x1={0} x2={iw} />
                  <text x={-8} dy="0.32em" textAnchor="end">{v}</text>
                </g>
              ))}
              {xTicks.map((t) => (
                <g key={t} transform={`translate(${x(t)},0)`}>
                  <line y1={0} y2={ih} />
                  <text y={ih + 16} textAnchor="middle">{usd(t)}</text>
                </g>
              ))}
            </g>
            <text x={iw / 2} y={ih + 36} textAnchor="middle">Cost index (USD, log scale) →</text>
            <text transform="rotate(-90)" x={-ih / 2} y={-32} textAnchor="middle">Intelligence Index</text>

            {pts.filter((p) => !hl.includes(p.lab)).map((p) => (
              <circle key={p.v.slug} cx={x(p.x)} cy={y(p.y)} r={3} fill="var(--axis)" opacity={0.8} />
            ))}

            <path d={stair} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeLinejoin="round" />

            {highlightedReleases.map((r) => {
              const vs = r.variants.filter((v) => v.cost != null).sort((a, b) => (a.cost as number) - (b.cost as number));
              const color = labColor(r.lab);
              return (
                <g key={r.slug}>
                  {vs.length > 1 && (
                    <path
                      d={vs.map((v, i) => `${i ? "L" : "M"}${x(v.cost as number)},${y(v.intelligence)}`).join("")}
                      pathLength={1}
                      className="draw-in"
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                  {vs.map((v) => (
                    <circle key={v.slug} className="pop-in" cx={x(v.cost as number)} cy={y(v.intelligence)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
                  ))}
                </g>
              );
            })}

            {labels.map((l) => {
              // measure-first: ~7px per character at 12px semibold; flip left if it would clip
              const flip = l.px + 8 + l.text.length * 7 > iw;
              return (
                <text
                  key={l.lab}
                  x={flip ? l.px - 8 : l.px + 8}
                  y={l.py - 8}
                  textAnchor={flip ? "end" : "start"}
                  style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600, paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}
                >
                  {l.text}
                </text>
              );
            })}

            {hover && (
              <circle cx={x(hover.x)} cy={y(hover.y)} r={7} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
            )}
            <rect width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </g>
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-[240px] rounded-lg border border-rule bg-raised px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(x(hover.x) + m.left + 14, width - 252),
              top: Math.max(0, y(hover.y) + m.top - 20),
            }}
          >
            <p className="font-medium text-ink">{hover.v.name}</p>
            <p className="mb-1.5 text-ink-3">
              {names[hover.lab] ?? hover.lab} · {hover.release.tier ?? "untiered"} tier
            </p>
            <Row k="Intelligence" v={hover.v.intelligence.toFixed(1) + (hover.v.estimated ? "*" : "")} />
            <Row k="Cost index" v={usd(hover.x)} />
            <Row k="Cost per task" v={hover.v.cost_per_task == null ? "—" : `${usd(hover.v.cost_per_task)}${hover.v.cost_per_task_imputed ? " (est.)" : ""}`} />
            <Row k="Blended $/1M" v={hover.release.price_blend == null ? "—" : usd(hover.release.price_blend)} />
            <Row k="Speed" v={hover.v.speed == null ? "—" : `${hover.v.speed.toFixed(0)} tok/s`} />
            <Row k="Value residual" v={hover.v.value_residual == null ? "—" : `${hover.v.value_residual > 0 ? "+" : ""}${hover.v.value_residual.toFixed(1)} pts`} />
          </div>
        )}
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[13px] font-medium text-ink">Frontier ownership</p>
        <p className="mb-3 text-xs text-ink-2">
          Who offers the cheapest model at each capability level, from the frontier (right) down 25 points (left). The right half
          is the <span className="text-ink">efficiency</span> zone, the left the <span className="text-ink">value</span> zone.
        </p>
        <div className="relative" style={{ marginLeft: m.left, marginRight: m.right }}>
          <svg width={iw} height={30} viewBox={`0 0 ${iw} 30`} preserveAspectRatio="none" className="block h-[30px] max-w-full" role="img" aria-label="Cheapest lab at each capability level">
            {levels.map((l, i) => (
              <rect
                key={l.gap}
                x={i * cw + 1}
                y={0}
                width={Math.max(1, cw - 2)}
                height={22}
                rx={3}
                fill={l.owner ? labColor(l.owner) : "var(--wash)"}
                onPointerEnter={() => setCell(l)}
                onPointerLeave={() => setCell(null)}
              />
            ))}
          </svg>
          <div className="flex justify-between text-[11px] text-ink-3">
            <span className="tabular">{levels[0]?.level.toFixed(1)}</span>
            <span>← value zone · efficiency zone →</span>
            <span className="tabular">{levels[levels.length - 1]?.level.toFixed(1)}</span>
          </div>
          <p className="mt-2 min-h-[20px] text-xs text-ink-2" aria-live="polite">
            {cell ? (
              <>
                Level <span className="tabular text-ink">{cell.level.toFixed(1)}</span>: {cell.owner ? names[cell.owner] : "nobody"}
                {cell.cost != null && <> at {usd(cell.cost)}</>}
                {cell.runner_up && cell.margin != null && (
                  <>, {Math.exp(cell.margin).toFixed(1)}× cheaper than {names[cell.runner_up]}</>
                )}
                {!cell.runner_up && cell.owner && <> (no rival reaches this level)</>}
              </>
            ) : (
              "Hover a cell for details."
            )}
          </p>
          <OwnerLegend levels={ownership} names={names} />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <p className="flex justify-between gap-3 py-px">
      <span className="text-ink-3">{k}</span>
      <span className="tabular text-ink">{v}</span>
    </p>
  );
}

function OwnerLegend({ levels, names }: { levels: OwnershipLevel[]; names: Record<string, string> }) {
  const counts = new Map<string, number>();
  for (const l of levels) if (l.owner) counts.set(l.owner, (counts.get(l.owner) ?? 0) + 1);
  return (
    <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-2">
      {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([lab, n]) => (
        <span key={lab} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: labColor(lab) }} />
          {names[lab] ?? lab} <span className="tabular text-ink-3">{n}</span>
        </span>
      ))}
    </div>
  );
}
