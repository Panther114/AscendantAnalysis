"use client";

import { scaleLinear, scaleLog } from "d3-scale";
import { useEffect, useMemo, useRef, useState } from "react";

import { labColor } from "@/lib/palette";
import { bestPlan, EFFORT_ORDER, fmtX, pareto, type PlanPick, type Region, usdTask } from "@/lib/plans";
import type { CodingPlan, CostModel, Effort } from "@/lib/types";
import { easeInOutCubic } from "./useTween";
import { LabPicker } from "./LabPicker";
import { Tabs } from "./Tabs";
import { useWidth } from "./useWidth";

interface Props {
  models: CostModel[];
  plans: CodingPlan[];
  names: Record<string, string>;
  labs: string[]; // in display order (best model first)
  initialLabs: string[];
}

interface Pt {
  m: CostModel;
  pick: PlanPick | null;
  x: number; // current (animated) cost
  y: number;
  px: number;
  py: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Animates a number toward `target` (eased); reduced-motion users get a short step. */
function useAnimated(target: number, duration = 900) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    if (from === target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 150 : duration;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = easeInOutCubic(Math.min(1, (now - start) / dur));
      cur.current = from + (target - from) * k;
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Frames can be throttled (background tabs, embedded views): always land on the target.
    const done = setTimeout(() => {
      cancelAnimationFrame(raf);
      cur.current = target;
      setV(target);
    }, dur + 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [target, duration]);
  return v;
}

function tickLabel(x: number) {
  if (x >= 1) return `$${x % 1 ? x.toFixed(1) : x.toFixed(0)}`;
  if (x >= 0.01) return `$${x.toFixed(2).replace(/0$/, "")}`;
  return `$${x}`;
}

function shortName(m: CostModel) {
  return m.effort === "Default" ? m.release_name : `${m.release_name} (${m.effort})`;
}

export function CostChart({ models, plans, names, labs, initialLabs }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(960);
  const [subsidy, setSubsidy] = useState(false);
  const [region, setRegion] = useState<Region>("all");
  const [log, setLog] = useState(true);
  const [frontier, setFrontier] = useState(true);
  const [labels, setLabels] = useState(true);
  const [selLabs, setSelLabs] = useState<string[]>(initialLabs);
  const efforts = useMemo(() => EFFORT_ORDER.filter((e) => models.some((m) => m.effort === e)), [models]);
  const [selEfforts, setSelEfforts] = useState<Effort[]>(efforts);
  const [hidden, setHidden] = useState<string[]>([]); // release slugs switched off
  const [hover, setHover] = useState<Pt | null>(null);

  // Shareable state: ?plans=on starts with plan pricing, ?region=china|global, ?scale=linear.
  useEffect(() => {
    const id = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      if (q.get("plans") === "on") setSubsidy(true);
      const r = q.get("region");
      if (r === "china" || r === "global") setRegion(r);
      if (q.get("scale") === "linear") setLog(false);
    }, 300); // after first paint, so the slide is visible
    return () => clearTimeout(id);
  }, []);

  const t = useAnimated(subsidy ? 1 : 0);
  const s = useAnimated(log ? 1 : 0, 700);

  const visible = useMemo(
    () =>
      models
        .filter((m) => selLabs.includes(m.lab) && selEfforts.includes(m.effort) && !hidden.includes(m.release))
        .map((m) => ({ m, pick: bestPlan(m, plans, region) })),
    [models, plans, region, selLabs, selEfforts, hidden],
  );

  const height = width < 560 ? 420 : 560;
  const mg = { top: 18, right: 24, bottom: 48, left: 48 };
  const iw = width - mg.left - mg.right;
  const ih = height - mg.top - mg.bottom;

  // One domain spans both states, so switching subsidies on visibly slides dots left.
  const allX = visible.flatMap((v) => [v.m.cost_per_task, v.pick?.cost ?? v.m.cost_per_task]);
  const lo = allX.length ? Math.min(...allX) : 0.01;
  const hi = allX.length ? Math.max(...allX) : 10;
  const xLog = scaleLog().domain([lo / 1.5, hi * 1.5]).range([0, iw]).clamp(true);
  const xLin = scaleLinear().domain([0, hi * 1.06]).range([0, iw]).nice();
  const yMax = Math.ceil((Math.max(10, ...visible.map((v) => v.m.intelligence)) + 4) / 10) * 10;
  const yS = scaleLinear().domain([0, yMax]).range([ih, 0]);
  const X = (v: number) => r2(xLin(v) + (xLog(v) - xLin(v)) * s);
  const Y = (v: number) => r2(yS(v));

  const pts: Pt[] = visible.map(({ m, pick }) => {
    const a = m.cost_per_task;
    const b = pick?.cost ?? a;
    // interpolate in log space so the slide reads as a constant-ratio move
    const x = Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
    return { m, pick, x, y: m.intelligence, px: X(x), py: Y(m.intelligence) };
  });
  const front = frontier ? pareto(pts) : [];
  const frontSet = new Set(front.map((p) => p.m.slug));
  const frontPath = front.map((p, i) => `${i ? "L" : "M"}${p.px},${p.py}`).join("");

  // Tick marks: decades/halves on log, d3 ticks on linear; fade between them.
  const narrow = iw < 520;
  const logTicks = (narrow ? [0.001, 0.01, 0.1, 1, 10] : [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30]).filter((v) => v >= xLog.domain()[0] && v <= xLog.domain()[1]);
  const linTicks = xLin.ticks(narrow ? 4 : 6);

  // Greedy label placement: frontier first, then by intelligence; skip overlaps.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labelPts = labels
    ? [...pts]
        .sort((a, b) => Number(frontSet.has(b.m.slug)) - Number(frontSet.has(a.m.slug)) || b.y - a.y)
        .slice(0, narrow ? 12 : 60)
        .flatMap((p) => {
          const text = shortName(p.m);
          const w = text.length * 6.1;
          const flip = p.px + 8 + w > iw;
          const x0 = flip ? p.px - 8 - w : p.px + 8;
          const box = { x0, x1: x0 + w, y0: p.py - 14, y1: p.py - 2 };
          if (box.y0 < -mg.top || placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return [];
          if (!frontSet.has(p.m.slug) && placed.length >= (narrow ? 6 : 18)) return [];
          placed.push(box);
          return [{ p, text, x: flip ? p.px - 8 : p.px + 8, anchor: flip ? "end" : "start" }];
        })
    : [];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * iw;
    const py = ((e.clientY - box.top) / box.height) * ih;
    let best: Pt | null = null;
    let bd = 18 * 18;
    for (const p of pts) {
      const d = (p.px - px) ** 2 + (p.py - py) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    setHover(best);
  };

  const withPlan = visible.filter((v) => v.pick).length;
  const mults = visible.map((v) => v.pick?.multiplier).filter((x): x is number => x != null).sort((a, b) => a - b);
  const median = mults.length ? mults[Math.floor(mults.length / 2)] : null;
  const releases = useMemo(() => {
    const seen = new Map<string, { release: string; name: string; lab: string; best: number }>();
    for (const m of models) {
      const r = seen.get(m.release);
      if (!r || m.intelligence > r.best) seen.set(m.release, { release: m.release, name: m.release_name, lab: m.lab, best: m.intelligence });
    }
    return [...seen.values()].sort((a, b) => b.best - a.best);
  }, [models]);
  const toggleEffort = (e: Effort) => setSelEfforts((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  return (
    <div>
      {/* primary control: the subsidy switch */}
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-rule bg-sunken/60 px-4 py-3">
        <button
          type="button"
          role="switch"
          aria-checked={subsidy}
          onClick={() => setSubsidy((v) => !v)}
          className="group flex items-center gap-3 text-left"
        >
          <span className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 ${subsidy ? "bg-ink" : "bg-axis"}`} style={{ background: subsidy ? "var(--ink)" : "var(--axis)" }}>
            <span className={`absolute h-5 w-5 rounded-full bg-page shadow transition-transform duration-300 ${subsidy ? "translate-x-6" : "translate-x-1"}`} />
          </span>
          <span>
            <span className="block text-[15px] font-medium text-ink">Price through the best coding plan</span>
            <span className="block text-xs text-ink-3">
              {subsidy ? "Cost per task ÷ the subsidy of the best eligible plan for each model" : "Off: Artificial Analysis API cost per task (list prices)"}
            </span>
          </span>
        </button>
        <div className={`flex items-center gap-2 text-xs transition-opacity ${subsidy ? "opacity-100" : "opacity-50"}`}>
          <span className="text-ink-3">Plans from</span>
          <Tabs
            options={[{ key: "all", label: "Anywhere" }, { key: "global", label: "Global" }, { key: "china", label: "China" }]}
            value={region}
            onChange={(k) => setRegion(k as Region)}
            className=""
          />
        </div>
        <p className="tabular ml-auto text-xs text-ink-3">
          {withPlan} of {visible.length} shown variants have a plan{median != null && <> · median subsidy {fmtX(median)}</>}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-ink-3">Cost axis</span>
          <Tabs options={[{ key: "log", label: "Log" }, { key: "lin", label: "Linear" }]} value={log ? "log" : "lin"} onChange={(k) => setLog(k === "log")} className="" />
        </div>
        <Check on={frontier} set={setFrontier}>Pareto frontier</Check>
        <Check on={labels} set={setLabels}>Labels</Check>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-full border border-rule px-3 py-1.5 text-ink-2 hover:border-ink-3 hover:text-ink">
            Models · {releases.length - hidden.length}/{releases.length} ▾
          </summary>
          <div className="absolute left-0 z-20 mt-2 max-h-[360px] w-[min(300px,calc(100vw-48px))] overflow-y-auto rounded-lg border border-rule bg-raised p-2 shadow-lg">
            <div className="mb-1 flex gap-2 px-1 pb-1 text-ink-3">
              <button type="button" className="hover:text-ink" onClick={() => setHidden([])}>Show all</button>
              <button type="button" className="hover:text-ink" onClick={() => setHidden(releases.map((r) => r.release))}>Hide all</button>
            </div>
            {releases.map((r) => (
              <label key={r.release} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-wash">
                <input
                  type="checkbox"
                  checked={!hidden.includes(r.release)}
                  onChange={() => setHidden((h) => (h.includes(r.release) ? h.filter((x) => x !== r.release) : [...h, r.release]))}
                />
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: labColor(r.lab) }} />
                <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
                <span className="tabular text-ink-3">{r.best.toFixed(0)}</span>
              </label>
            ))}
          </div>
        </details>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Reasoning effort">
        <span className="mr-1 text-ink-3">Reasoning effort:</span>
        {efforts.map((e) => {
          const on = selEfforts.includes(e);
          return (
            <button
              key={e}
              type="button"
              aria-pressed={on}
              onClick={() => toggleEffort(e)}
              className={`rounded-full border px-2.5 py-0.5 transition-colors ${on ? "border-ink bg-ink text-page" : "border-rule text-ink-3 hover:border-ink-3 hover:text-ink-2"}`}
            >
              {e}
            </button>
          );
        })}
        <button type="button" className="ml-1 rounded-full px-2 py-0.5 text-ink-3 hover:text-ink" onClick={() => setSelEfforts(efforts)}>All</button>
      </div>

      <LabPicker options={labs.map((lab) => ({ lab, name: names[lab] ?? lab }))} selected={selLabs} onChange={setSelLabs} label="Labs" />

      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="viz block h-auto max-w-full" role="img" aria-label="Intelligence Index versus cost per task for current models">
          <g transform={`translate(${mg.left},${mg.top})`}>
            <g className="grid">
              {yS.ticks(6).map((v) => (
                <g key={v} transform={`translate(0,${Y(v)})`}>
                  <line x1={0} x2={iw} />
                  <text x={-8} dy="0.32em" textAnchor="end">{v}</text>
                </g>
              ))}
              {logTicks.map((v) => (
                <g key={`l${v}`} transform={`translate(${X(v)},0)`} opacity={s}>
                  <line y1={0} y2={ih} />
                  <text y={ih + 16} textAnchor="middle">{tickLabel(v)}</text>
                </g>
              ))}
              {linTicks.map((v) => (
                <g key={`n${v}`} transform={`translate(${X(v)},0)`} opacity={1 - s}>
                  <line y1={0} y2={ih} />
                  <text y={ih + 16} textAnchor="middle">{tickLabel(v)}</text>
                </g>
              ))}
            </g>
            <text x={iw / 2} y={ih + 38} textAnchor="middle">
              {narrow
                ? `Cost per task, USD (${log ? "log" : "linear"}) →`
                : `${subsidy ? "Cost per Intelligence Index task through the best coding plan" : "Cost per Intelligence Index task at API list price"} (USD, ${log ? "log" : "linear"}) →`}
            </text>
            <text transform="rotate(-90)" x={-ih / 2} y={-34} textAnchor="middle">Artificial Analysis Intelligence Index</text>

            {/* slide trails: where each subsidized dot came from */}
            {t > 0.01 &&
              pts.filter((p) => p.pick).map((p) => (
                <line key={`tr${p.m.slug}`} x1={X(p.m.cost_per_task)} x2={p.px} y1={p.py} y2={p.py} stroke={labColor(p.m.lab)} strokeOpacity={0.28 * t} strokeWidth={1.5} strokeDasharray="2 3" />
              ))}

            {front.length > 1 && (
              <path d={frontPath} fill="none" stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5 4" strokeLinejoin="round" />
            )}

            {pts.map((p) => {
              const onFront = frontSet.has(p.m.slug);
              const dim = !p.pick ? 1 - 0.6 * t : 1;
              return (
                <circle
                  key={p.m.slug}
                  cx={p.px}
                  cy={p.py}
                  r={onFront ? 5.5 : 4.5}
                  fill={labColor(p.m.lab)}
                  fillOpacity={dim}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              );
            })}

            {labelPts.map((l) => (
              <text
                key={`lb${l.p.m.slug}`}
                x={l.x}
                y={l.p.py - 6}
                textAnchor={l.anchor as "start" | "end"}
                style={{ fill: frontSet.has(l.p.m.slug) ? "var(--ink)" : "var(--ink-2)", fontSize: 11, fontWeight: frontSet.has(l.p.m.slug) ? 600 : 400, paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}
              >
                {l.text}
              </text>
            ))}

            {hover && <circle cx={hover.px} cy={hover.py} r={9} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
            <rect width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </g>
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-[270px] rounded-lg border border-rule bg-raised px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.max(0, Math.min(hover.px + mg.left + 14, width - 282)), top: Math.max(0, hover.py + mg.top - 24) }}
          >
            <p className="font-medium text-ink">{hover.m.name}</p>
            <p className="mb-1.5 text-ink-3">{names[hover.m.lab] ?? hover.m.lab}{hover.m.open_weights ? " · open weights" : ""}</p>
            <Row k="Intelligence Index" v={hover.m.intelligence.toFixed(1) + (hover.m.estimated ? "*" : "")} />
            <Row k="API cost per task" v={usdTask(hover.m.cost_per_task)} />
            {hover.m.price_in != null && <Row k="API $/1M in · out" v={`$${hover.m.price_in} · $${hover.m.price_out}`} />}
            {hover.pick ? (
              <>
                <div className="my-1.5 border-t border-rule-soft" />
                <Row k="Best plan" v={`${hover.pick.plan.product} ${hover.pick.plan.plan}`} />
                <Row k="Plan price" v={`$${hover.pick.plan.price_usd.toFixed(hover.pick.plan.price_usd % 1 ? 2 : 0)}/mo · ${hover.pick.plan.region === "china" ? "China" : "global"}`} />
                <Row k="Subsidy" v={fmtX(hover.pick.multiplier)} />
                <Row k="Plan cost per task" v={usdTask(hover.pick.cost)} strong />
                {hover.pick.confidence && <p className="mt-1 text-[11px] text-ink-3">Confidence: {hover.pick.confidence}</p>}
              </>
            ) : (
              <p className="mt-1.5 text-ink-3">No eligible coding plan{region !== "all" ? ` in ${region === "china" ? "China" : "global"} plans` : ""}: API price only.</p>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="flex items-center gap-1.5"><svg width="22" height="6" aria-hidden="true"><line x1="0" x2="22" y1="3" y2="3" stroke="var(--ink)" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="5 4" /></svg>Pareto frontier (nothing is both cheaper and smarter)</span>
        <span>Faded dots: no eligible plan, so they keep their API price</span>
        <span>* estimated index</span>
      </p>
    </div>
  );
}

function Check({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5 text-ink-2 hover:text-ink">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-current" />
      {children}
    </label>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <p className="flex justify-between gap-3 py-px">
      <span className="text-ink-3">{k}</span>
      <span className={`tabular text-right ${strong ? "font-semibold text-ink" : "text-ink"}`}>{v}</span>
    </p>
  );
}
