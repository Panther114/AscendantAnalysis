"use client";

import { scaleLinear, scaleUtc } from "d3-scale";
import { line as d3line } from "d3-shape";
import { useMemo, useState } from "react";

import { labColor } from "@/lib/palette";
import { eventWeight, type LeaderSpan, type RaceEvent } from "@/lib/race";
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
  /** Daily #1 by health, drawn as a colored band above the plot. */
  leaders?: LeaderSpan[];
  /** Landscape-shifting releases, laid out on lanes below the plot. */
  events?: RaceEvent[];
}

const M = { top: 14, right: 132, bottom: 28, left: 40 };
const MAX_END_LABELS = 8; // beyond this, end labels collide; the tooltip and picker carry identity
const MAX_TIP_ROWS = 12;
const LEADER_BAND = 40; // caption + band above the plot
const LANE_H = 22;
const EVENTS_TOP = 54; // axis labels + caption below the plot
const PILL_H = 18;
const CHAR_W = 6.1; // approx. advance of an 11px Geist character

const KIND_TEXT = { lead: "Took the lead", top3: "Entered the top 3", surge: "Surged 15+ points in a day" } as const;

const shortName = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

interface Placed {
  e: RaceEvent;
  k: number; // index into events
  x: number;
  lane: number;
  w: number; // 0 = dot only
  label: string;
}

/** Strongest events claim lanes first; whatever can't fit a label still gets a dot at its date. */
function layoutEvents(events: RaceEvent[], xOf: (e: RaceEvent) => number, iw: number, lanes: number): Placed[] {
  const taken: [number, number][][] = Array.from({ length: lanes }, () => []);
  const free = (lane: number, a: number, b: number) => taken[lane].every(([p, q]) => b < p || a > q);
  const order = events.map((e, k) => ({ e, k })).sort((a, b) => eventWeight(b.e) - eventWeight(a.e));
  const out: Placed[] = [];
  for (const { e, k } of order) {
    const x = xOf(e);
    const label = shortName(e.release ?? `${e.labName} leads`, 22);
    const w = Math.round(label.length * CHAR_W + 24);
    const a = x - 9;
    let placed: Placed | null = null;
    if (a + w <= iw + 4) {
      for (let lane = 0; lane < lanes && !placed; lane++) if (free(lane, a - 3, a + w + 3)) placed = { e, k, x, lane, w, label };
    }
    if (!placed) {
      for (let lane = 0; lane < lanes && !placed; lane++) if (free(lane, x - 5, x + 5)) placed = { e, k, x, lane, w: 0, label };
      placed ??= { e, k, x, lane: lanes - 1, w: 0, label };
    }
    taken[placed.lane].push(placed.w ? [a, a + placed.w] : [x - 5, x + 5]);
    out.push(placed);
  }
  return out.sort((p, q) => eventWeight(p.e) - eventWeight(q.e)); // strongest painted last
}

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
  leaders,
  events,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [shownLocal, setShownLocal] = useState<string[]>(initial);
  const shown = shownProp ?? shownLocal;
  const setShown = onShownChange ?? setShownLocal;
  const [hover, setHover] = useState<number | null>(null);
  const [hoverEv, setHoverEv] = useState<number | null>(null);

  const narrow = width < 560;
  const lb = leaders?.length ? LEADER_BAND : 0;
  const lanes = events?.length ? (narrow ? 5 : 6) : 0;
  const eb = lanes ? EVENTS_TOP + lanes * LANE_H : 0;
  const m = { ...M, top: M.top + lb, right: narrow ? 14 : M.right };
  const iw = Math.max(10, width - m.left - m.right);
  const ih = height - M.top - M.bottom;
  const svgH = height + lb + eb;
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
  const leaderAt = hover == null ? null : leaders?.find((l) => hover >= l.start && hover <= l.end);

  const placedEvents = events?.length && width > 0 ? layoutEvents(events, (e) => x(t[e.i]), iw, lanes) : [];
  const evY = (lane: number) => ih + EVENTS_TOP + lane * LANE_H;
  const active = hoverEv == null ? null : (placedEvents.find((p) => p.k === hoverEv) ?? null);
  const evLeft = active ? active.x + m.left : 0;
  const evFlip = evLeft > width - 260;

  return (
    <div>
      <LabPicker
        options={series.map((s) => ({ lab: s.lab, name: s.name, color: s.color, logo: s.logo }))}
        selected={shown}
        onChange={setShown}
        presets={presets}
      />
      <div ref={ref} className="relative w-full">
        <svg width={width} height={svgH} viewBox={`0 0 ${width} ${svgH}`} className="viz block h-auto max-w-full" role="img" aria-label={`${metric} over time`}>
          <g transform={`translate(${m.left},${m.top})`}>
            {lb > 0 && leaders && (
              <g aria-label="Health leader by day">
                <text x={0} y={-lb + 8} style={{ fontSize: 11, fill: "var(--ink-3)" }}>
                  #1 in health
                </text>
                {leaders.map((l) => {
                  const x0 = x(t[l.start]);
                  const x1 = l.end + 1 < t.length ? x(t[l.end + 1]) : iw;
                  const w = Math.max(1, x1 - x0);
                  const label = w > 44 ? shortName(l.name, Math.floor((w - 10) / 6.4)) : "";
                  const on = hover != null && hover >= l.start && hover <= l.end;
                  return (
                    <g key={l.start}>
                      <rect x={x0} y={-lb + 16} width={w} height={18} fill={labColor(l.lab)} opacity={hover == null || on ? 1 : 0.55} />
                      {label && (
                        <text x={x0 + 5} y={-lb + 25} dy="0.32em" pointerEvents="none" style={{ fontSize: 10.5, fontWeight: 600, fill: `var(--lab-${l.lab}-ink, var(--ink))` }}>
                          {label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}
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
            {placedEvents.length > 0 && (
              <g aria-label="Releases that moved the race">
                <text x={0} y={ih + EVENTS_TOP - 14} style={{ fontSize: 11, fill: "var(--ink-3)" }}>
                  Releases that moved the race
                </text>
                {placedEvents.map((p) => (
                  <line key={`tick-${p.k}`} x1={p.x} x2={p.x} y1={ih - 3} y2={ih + 3} stroke={labColor(p.e.lab)} strokeWidth={1.5} />
                ))}
                {active && (
                  <line x1={active.x} x2={active.x} y1={0} y2={evY(active.lane)} stroke={labColor(active.e.lab)} strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />
                )}
                {placedEvents.map((p) => {
                  const lead = p.e.kinds[0] === "lead";
                  const y0 = evY(p.lane);
                  return (
                    <g
                      key={p.k}
                      opacity={active != null && active.k !== p.k ? 0.35 : 1}
                      style={{ transition: "opacity 150ms" }}
                      onPointerEnter={() => setHoverEv(p.k)}
                      onPointerLeave={() => setHoverEv(null)}
                      onPointerDown={() => setHoverEv(p.k)}
                    >
                      {p.w > 0 ? (
                        <>
                          <rect
                            x={p.x - 9}
                            y={y0}
                            width={p.w}
                            height={PILL_H}
                            rx={PILL_H / 2}
                            fill={lead ? labColor(p.e.lab) : "var(--surface)"}
                            stroke={lead || p.e.kinds[0] === "top3" ? labColor(p.e.lab) : "var(--rule)"}
                            strokeWidth={1.25}
                          />
                          <circle cx={p.x} cy={y0 + PILL_H / 2} r={3.5} fill={lead ? `var(--lab-${p.e.lab}-ink)` : labColor(p.e.lab)} />
                          <text
                            x={p.x + 8}
                            y={y0 + PILL_H / 2}
                            dy="0.34em"
                            style={{ fontSize: 11, fontWeight: lead ? 600 : 500, fill: lead ? `var(--lab-${p.e.lab}-ink)` : "var(--ink-2)" }}
                          >
                            {p.label}
                          </text>
                        </>
                      ) : (
                        <>
                          <rect x={p.x - 6} y={y0} width={12} height={PILL_H} fill="transparent" />
                          <circle cx={p.x} cy={y0 + PILL_H / 2} r={4} fill={labColor(p.e.lab)} stroke="var(--surface)" strokeWidth={1.5} />
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            )}
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
            <rect y={-lb} width={iw} height={ih + lb} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }} />
          </g>
        </svg>
        {hover != null && hoverRows.length > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[190px] rounded-lg border border-rule bg-raised px-3 py-2 text-xs shadow-lg"
            style={{ left: tipFlip ? undefined : tipLeft + 14, right: tipFlip ? width - tipLeft + 14 : undefined }}
          >
            <p className="mb-1.5 font-medium text-ink">{fmtDay(t[hover])}</p>
            {leaderAt && (
              <p className="mb-1.5 flex items-center gap-1.5 border-b border-rule-soft pb-1.5 text-ink-3">
                <span className="h-2 w-2" style={{ background: labColor(leaderAt.lab) }} />
                Leader: <span className="text-ink">{leaderAt.name}</span>
              </p>
            )}
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
        {active && (
          <div
            className="pointer-events-none absolute z-20 w-[250px] rounded-lg border border-rule bg-raised px-3 py-2 text-xs shadow-lg"
            style={{
              bottom: svgH - (m.top + evY(active.lane)) + 6,
              left: evFlip ? undefined : Math.max(0, evLeft - 12),
              right: evFlip ? Math.max(0, width - evLeft - 12) : undefined,
            }}
          >
            <p className="text-ink-3">{fmtDay(t[active.e.i])}</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-medium text-ink">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: labColor(active.e.lab) }} />
              {active.e.release ?? active.e.labName}
              {active.e.more > 0 && <span className="font-normal text-ink-3">+{active.e.more} more</span>}
            </p>
            {active.e.release && <p className="text-ink-3">{active.e.labName}</p>}
            <ul className="mt-1.5 space-y-0.5 border-t border-rule-soft pt-1.5 text-ink-2">
              {active.e.kinds.map((k) => (
                <li key={k}>
                  {k === "lead" && active.e.dethroned
                    ? `Took #1 from ${active.e.dethroned}${active.e.release ? "" : " (no new release)"}`
                    : KIND_TEXT[k]}
                </li>
              ))}
              <li className="tabular">
                Health {active.e.from == null ? "unranked" : active.e.from.toFixed(1)} → <span className="font-medium text-ink">{active.e.to.toFixed(1)}</span>
                {active.e.from != null && (
                  <span className={active.e.to >= active.e.from ? "text-good" : "text-bad"}>
                    {` (${active.e.to >= active.e.from ? "+" : "−"}${Math.abs(active.e.to - active.e.from).toFixed(1)})`}
                  </span>
                )}
              </li>
              {active.e.rankTo != null && (
                <li className="tabular">
                  Rank {active.e.rankFrom ?? "—"} → <span className="font-medium text-ink">{active.e.rankTo}</span>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
