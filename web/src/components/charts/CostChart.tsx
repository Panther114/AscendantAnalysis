"use client";

import { scaleLinear, scaleLog } from "d3-scale";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { labColor } from "@/lib/palette";
import { bestPlan, EFFORT_ORDER, fmtX, pareto, type PlanPick, type Region } from "@/lib/plans";
import type { CodingPlan, CostModel, Effort } from "@/lib/types";
import { easeInOutCubic } from "./useTween";
import { LabPicker } from "./LabPicker";
import { Tabs } from "./Tabs";
import { useWidth } from "./useWidth";

interface Props {
  models: CostModel[];
  archive: CostModel[]; // retired models with a documented cost per task
  plans: CodingPlan[];
  names: Record<string, string>;
  labs: string[]; // in display order (best model first)
  initialLabs: string[];
  labPages?: string[]; // labs that have a /labs/<slug>/ page (tooltip click-through)
  meta: Record<string, ReleaseMeta>; // per release: launch date and competitiveness
  today: string; // ISO date of the data snapshot: the right end of the time slider
}

export interface ReleaseMeta {
  date: string;
  competitiveness: number | null;
}

interface Pt {
  m: CostModel;
  pick: PlanPick | null;
  shown: boolean; // selected by the filters and inside the age window; unselected frontier members are drawn faded
  fit: boolean; // selected by the filters (the age window aside)
  inAge: boolean; // inside the release-age window
  x: number; // current (animated) cost
  y: number;
  px: number;
  py: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PlacedLabel {
  p: Pt;
  text: string;
  box: Box;
  leader: [number, number, number, number] | null;
}

// Geometry measured from Artificial Analysis's "Intelligence Index vs. Cost per Task" chart.
const HEIGHT = 384;
const MG = { top: 5, right: 5, bottom: 53, left: 65 };
const DOT_R = 4.5;
const HIT = 40; // px: the nearest dot within this distance owns the tooltip
const LABEL_H = 11;
const FADED = 0.25; // frontier members the filters have switched off

const DAY = 864e5;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const RELEVANT_PER_LAB = 2; // a lab's most competitive releases kept by "Relevant only"

// Release-age gradient, newest to oldest: warm to cool, legible on light and dark pages.
const AGE_STOPS = ["#e8362d", "#f59e0b", "#3fae5a", "#1a8fb5", "#5b3fb5"].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
/** u in [0, 1] (0 = just released) to a color. */
function ageColor(u: number) {
  const k = Math.min(1, Math.max(0, u)) * (AGE_STOPS.length - 1);
  const i = Math.min(AGE_STOPS.length - 2, Math.floor(k));
  const f = k - i;
  const c = AGE_STOPS[i].map((v, j) => Math.round(v + (AGE_STOPS[i + 1][j] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const ageFrac = (age: number, maxAge: number) => (maxAge > 0 ? Math.sqrt(Math.min(1, Math.max(0, age / maxAge))) : 0);
const AGE_TICKS: [number, string][] = [[0, "Release day"], [30, "1 mo"], [90, "3 mo"], [180, "6 mo"], [365, "1 yr"], [730, "2 yr"]];

const fmtLongDate = (n: number) => new Date(n * DAY).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

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

/** Tooltip cost, the way AA prints it: cents, then finer below a dime. */
function fmtCost(x: number) {
  if (x >= 0.1) return `$${x.toFixed(2)}`;
  if (x >= 0.01) return `$${x.toFixed(3)}`;
  return `$${x.toPrecision(2)}`;
}

function shortName(m: CostModel) {
  return m.effort === "Default" ? m.release_name : `${m.release_name} (${m.effort})`;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Rendered width of a 11px chart label (canvas, so it follows the loaded web font). */
function labelWidth(text: string, family: string) {
  if (measureCtx === undefined) measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!measureCtx) return text.length * 5.8;
  measureCtx.font = `400 11px ${family}`;
  return measureCtx.measureText(text).width;
}

/** Nearest point of `b` to (x, y). */
function nearestOn(b: Box, x: number, y: number): [number, number] {
  return [Math.min(b.x1, Math.max(b.x0, x)), Math.min(b.y1, Math.max(b.y0, y))];
}

const overlap = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Greedy label placement in AA's style: every point is named when a clear spot exists. A label
 * sits beside its dot, or, when that is taken, further out on a hairline leader. Frontier models
 * and the highest scorers choose first; a label never covers another label or dot.
 */
function placeLabels(pts: Pt[], front: Set<string>, iw: number, ih: number, family: string): PlacedLabel[] {
  const order = [...pts].sort((a, b) => Number(front.has(b.m.slug)) - Number(front.has(a.m.slug)) || b.y - a.y);
  const placed: PlacedLabel[] = [];
  const taken: Box[] = [];
  const dots = pts.map((p) => ({ p, c: [p.px, p.py] as const }));
  const hitsDot = (b: Box, self: Pt) =>
    dots.some(({ p, c }) => {
      if (p === self) return false;
      const [nx, ny] = nearestOn(b, c[0], c[1]);
      return (nx - c[0]) ** 2 + (ny - c[1]) ** 2 < (DOT_R + 1.5) ** 2;
    });
  for (const p of order) {
    const text = shortName(p.m);
    const w = labelWidth(text, family);
    const h = LABEL_H;
    let chosen: PlacedLabel | null = null;
    for (const d of [DOT_R + 3, DOT_R + 14, DOT_R + 28, DOT_R + 44]) {
      const k = d * 0.72;
      const cands: Box[] = [
        { x0: p.px + d, x1: p.px + d + w, y0: p.py - h / 2, y1: p.py + h / 2 }, // right
        { x0: p.px - d - w, x1: p.px - d, y0: p.py - h / 2, y1: p.py + h / 2 }, // left
        { x0: p.px - w / 2, x1: p.px + w / 2, y0: p.py - d - h, y1: p.py - d }, // above
        { x0: p.px - w / 2, x1: p.px + w / 2, y0: p.py + d, y1: p.py + d + h }, // below
        { x0: p.px + k, x1: p.px + k + w, y0: p.py - k - h, y1: p.py - k }, // up-right
        { x0: p.px - k - w, x1: p.px - k, y0: p.py - k - h, y1: p.py - k }, // up-left
        { x0: p.px + k, x1: p.px + k + w, y0: p.py + k, y1: p.py + k + h }, // down-right
        { x0: p.px - k - w, x1: p.px - k, y0: p.py + k, y1: p.py + k + h }, // down-left
      ];
      for (const box of cands) {
        if (box.x0 < 0 || box.x1 > iw || box.y0 < 0 || box.y1 > ih) continue;
        const pad = { x0: box.x0 - 1.5, x1: box.x1 + 1.5, y0: box.y0 - 1, y1: box.y1 + 1 };
        if (taken.some((t) => overlap(pad, t)) || hitsDot(pad, p)) continue;
        const [nx, ny] = nearestOn(box, p.px, p.py);
        const gap = Math.hypot(nx - p.px, ny - p.py);
        chosen = { p, text, box, leader: gap > DOT_R + 4 ? [p.px, p.py, nx, ny] : null };
        break;
      }
      if (chosen) break;
    }
    if (chosen) {
      placed.push(chosen);
      taken.push(chosen.box);
    }
  }
  return placed;
}

/** Log-axis tick values in AA's rhythm: 1 2 3 4 6 8 per decade (plus 5 from $1 up). */
function logTicks(lo: number, hi: number, narrow: boolean, px: (v: number) => number) {
  const mult = narrow ? [1, 3] : [1, 2, 3, 4, 6, 8];
  const rank = (k: number) => (k === 1 ? 0 : k === 3 ? 1 : k === 2 || k === 5 ? 2 : 3);
  const out: { v: number; r: number; w: number }[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const k of e >= 0 && !narrow ? [...mult, 5].sort((a, b) => a - b) : mult) {
      const v = +(k * 10 ** e).toPrecision(12);
      if (v >= lo && v <= hi) out.push({ v, r: rank(k), w: tickLabel(v).length * 6.2 + 10 });
    }
  }
  // Powers of ten claim their space first; the rest fill in wherever the labels still fit.
  const kept: { v: number; w: number }[] = [];
  for (const c of [...out].sort((a, b) => a.r - b.r || a.v - b.v)) {
    if (kept.every((k) => Math.abs(px(c.v) - px(k.v)) >= (c.w + k.w) / 2)) kept.push(c);
  }
  return kept.map((k) => k.v).sort((a, b) => a - b);
}

export function CostChart({ models: current, archive, plans, names, labs, initialLabs, labPages = [], meta, today }: Props) {
  const router = useRouter();
  const clipId = useId();
  const [ref, width] = useWidth<HTMLDivElement>(960);
  const [subsidy, setSubsidy] = useState(false);
  const [region, setRegion] = useState<Region>("all");
  const [log, setLog] = useState(true);
  const [frontier, setFrontier] = useState(true);
  const [labels, setLabels] = useState(true);
  const [selLabs, setSelLabs] = useState<string[]>(initialLabs);
  const [past, setPast] = useState(false); // include retired models
  const allModels = useMemo(() => (past ? [...current, ...archive] : current), [past, current, archive]);
  const retired = useMemo(() => new Set(archive.map((m) => m.slug)), [archive]);
  const [relevantOnly, setRelevantOnly] = useState(false);
  const [ageMode, setAgeMode] = useState(false);
  const [back, setBack] = useState(0); // time travel: days before the snapshot
  const efforts = useMemo(() => EFFORT_ORDER.filter((e) => allModels.some((m) => m.effort === e)), [allModels]);
  const [selEfforts, setSelEfforts] = useState<Effort[]>(efforts);
  const [hidden, setHidden] = useState<string[]>([]); // release slugs switched off
  const [hover, setHover] = useState<Pt | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [fontKey, setFontKey] = useState(0); // bumps once the web font is in, so label widths are right
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false); // false while server-rendering
  const armed = useRef(true); // touch: the first tap shows the tooltip, a second tap on it opens the lab

  useEffect(() => {
    document.fonts?.ready.then(() => setFontKey(1));
  }, []);

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

  const todayN = dayNum(today);
  const relDay = useMemo(() => {
    const out = new Map<string, number>();
    for (const m of allModels) out.set(m.release, meta[m.release] ? dayNum(meta[m.release].date) : todayN);
    return out;
  }, [allModels, meta, todayN]);
  const firstN = useMemo(() => Math.min(todayN, ...relDay.values()), [relDay, todayN]);
  const span = Math.max(1, todayN - firstN);
  const asOfN = todayN - Math.min(back, span);
  // The lineup on the chosen day: every tracked model that had launched by then.
  const models = useMemo(() => allModels.filter((m) => (relDay.get(m.release) ?? todayN) <= asOfN), [allModels, relDay, asOfN, todayN]);
  const maxAge = useMemo(() => Math.max(1, ...models.map((m) => asOfN - (relDay.get(m.release) ?? asOfN))), [models, relDay, asOfN]);
  // Release-age window (age mode): thumbs live in the gradient's own sqrt space, 0..1000, so they
  // line up with the legend and keep their place when the chart date moves.
  const [rng, setRng] = useState<[number, number]>([0, 1000]);
  const windowed = ageMode && (rng[0] > 0 || rng[1] < 1000);
  const ageLoD = maxAge * (rng[0] / 1000) ** 2;
  const ageHiD = maxAge * (rng[1] / 1000) ** 2;
  const inAge = (m: CostModel) => {
    if (!ageMode) return true;
    const age = asOfN - (relDay.get(m.release) ?? asOfN);
    return age >= ageLoD && age <= ageHiD;
  };
  const dotColor = (m: CostModel) => (ageMode ? ageColor(ageFrac(asOfN - (relDay.get(m.release) ?? asOfN), maxAge)) : labColor(m.lab));

  const t = useAnimated(subsidy ? 1 : 0);
  const s = useAnimated(log ? 1 : 0, 700);
  const settled = Math.abs(t - (subsidy ? 1 : 0)) < 0.002 && Math.abs(s - (log ? 1 : 0)) < 0.002;

  const base = useMemo(() => models.map((m) => ({ m, pick: bestPlan(m, plans, region) })), [models, plans, region]);

  // "Relevant" models, decided from the whole lineup (never the filters), deterministically:
  // the Pareto frontier at the current pricing, plus each lab's most competitive releases.
  // A release off the frontier is represented by its highest reasoning effort alone.
  const relevant = useMemo(() => {
    const out = new Set<string>();
    const cost = (b: (typeof base)[number]) => (subsidy ? b.pick?.cost ?? b.m.cost_per_task : b.m.cost_per_task);
    for (const p of pareto(base.map((b) => ({ x: cost(b), y: b.m.intelligence, slug: b.m.slug })))) out.add(p.slug);
    const byRelease = new Map<string, CostModel[]>();
    for (const { m } of base) byRelease.set(m.release, [...(byRelease.get(m.release) ?? []), m]);
    const byLab = new Map<string, { release: string; comp: number; best: number }[]>();
    for (const [release, vs] of byRelease) {
      const row = { release, comp: meta[release]?.competitiveness ?? -1, best: Math.max(...vs.map((v) => v.intelligence)) };
      byLab.set(vs[0].lab, [...(byLab.get(vs[0].lab) ?? []), row]);
    }
    for (const rows of byLab.values()) {
      rows.sort((a, b) => b.comp - a.comp || b.best - a.best || a.release.localeCompare(b.release));
      for (const { release } of rows.slice(0, RELEVANT_PER_LAB)) {
        const vs = [...(byRelease.get(release) ?? [])];
        if (vs.some((v) => out.has(v.slug))) continue;
        vs.sort((a, b) => EFFORT_ORDER.indexOf(a.effort) - EFFORT_ORDER.indexOf(b.effort) || b.intelligence - a.intelligence || a.slug.localeCompare(b.slug));
        out.add(vs[0].slug);
      }
    }
    return out;
  }, [base, subsidy, meta]);
  const isShown = (m: CostModel) =>
    selLabs.includes(m.lab) && !hidden.includes(m.release) && (relevantOnly ? relevant.has(m.slug) : selEfforts.includes(m.effort));
  const visible = useMemo(
    () => base.filter((v) => isShown(v.m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, selLabs, selEfforts, hidden, relevantOnly, relevant],
  );

  const iw = width - MG.left - MG.right;
  const ih = HEIGHT - MG.top - MG.bottom;

  // Scales follow AA's rules: the log axis runs from the cheapest dot to ~2.4x the dearest
  // (headroom for labels), the index axis pads one 5-point step beyond the data. One domain
  // spans both states, so switching subsidies on visibly slides dots left.
  // The domain follows the pricing state and eases with the dots: switching subsidies on refits the
  // axes to the (much cheaper) plan costs instead of leaving every dot packed at the left.
  const apiX = visible.map((v) => v.m.cost_per_task);
  const planX = visible.map((v) => v.pick?.cost ?? v.m.cost_per_task);
  const lerpLog = (a: number, b: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
  const lo = apiX.length ? lerpLog(Math.min(...apiX), Math.min(...planX)) : 0.01;
  const hi = apiX.length ? lerpLog(Math.max(...apiX), Math.max(...planX)) : 10;
  // Linear axis: fit the bulk, not the stragglers. A few dear outliers (models with no plan keep
  // their API price) would otherwise squash everything else; they are pinned to the right edge.
  const fitHi = (a: number[]) => {
    const v = [...a].sort((x, y) => x - y);
    const q = v[Math.floor(0.93 * (v.length - 1))];
    return v[v.length - 1] <= q * 1.6 ? v[v.length - 1] : q * 1.15;
  };
  const hiLin = apiX.length ? lerpLog(fitHi(apiX), fitHi(planX)) : 10;
  const ys = visible.map((v) => v.m.intelligence);
  const yLo = Math.max(0, Math.floor((ys.length ? Math.min(...ys) : 0) / 5) * 5 - 5);
  const yHi = Math.ceil((ys.length ? Math.max(...ys) : 60) / 5) * 5 + 5;
  const xLog = scaleLog().domain([lo * 0.99, hi * 2.4]).range([0, iw]).clamp(true); // clamp: linear ticks include $0
  const xLin = scaleLinear().domain([0, hiLin * 1.06]).range([0, iw]);
  const yS = scaleLinear().domain([yLo, yHi]).range([ih, 0]);
  const X = (v: number) => r2(xLin(v) + (xLog(v) - xLin(v)) * s);
  const Y = (v: number) => r2(yS(v));
  const yStep = (yHi - yLo) / 5 <= 12 ? 5 : 10;
  const yTicks = Array.from({ length: Math.floor((yHi - yLo) / yStep) + 1 }, (_, i) => yLo + i * yStep);

  const xLoD = xLog.domain()[0];
  const xHiD = xLog.domain()[1];
  const pts: Pt[] = useMemo(
    () => {
      const lx = scaleLog().domain([xLoD, xHiD]).range([0, iw]);
      const nx = scaleLinear().domain(xLin.domain()).range([0, iw]);
      return base.map(({ m, pick }) => {
        const a = m.cost_per_task;
        const b = pick?.cost ?? a;
        // interpolate in log space so the slide reads as a constant-ratio move
        const x = Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
        const fit = isShown(m);
        const ia = inAge(m);
        return { m, pick, fit, inAge: ia, shown: fit && ia, x, y: m.intelligence, px: r2(Math.min(nx(x), iw - DOT_R - 1) + (lx(x) - Math.min(nx(x), iw - DOT_R - 1)) * s), py: Y(m.intelligence) };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, selLabs, selEfforts, hidden, relevantOnly, relevant, t, s, iw, xLoD, xHiD, yLo, yHi, hi, hiLin, ageMode, ageLoD, ageHiD, asOfN, relDay],
  );
  const shownPts = pts.filter((p) => p.shown);

  // The frontier is drawn over every model, as AA does: members the filters switched off stay
  // on the line as faded dots, so the line never changes just because a lab was unticked.
  // Inside an age window the line is the frontier of the models still on the chart; the frontier of
  // the whole lineup stays behind it as a faint mark, so the two can be compared as the window moves.
  const allFront = frontier ? pareto(pts) : [];
  const front = windowed ? pareto(pts.filter((p) => p.inAge)) : allFront;
  const ghostPath = windowed ? allFront.map((p, i) => `${i ? "L" : "M"}${p.px},${p.py}`).join("") : "";
  const frontSet = new Set(front.map((p) => p.m.slug));
  const frontPath = front.map((p, i) => `${i ? "L" : "M"}${p.px},${p.py}`).join("");
  const fadedPts = front.filter((p) => !p.shown && p.px > -DOT_R && p.px < iw + DOT_R && p.py > -DOT_R && p.py < ih + DOT_R);

  const pinned = log ? 0 : shownPts.filter((p) => p.x > xLin.domain()[1]).length;
  const narrow = iw < 520;
  const logT = logTicks(xLog.domain()[0], xLog.domain()[1], narrow, (v) => xLog(v));
  const linT = xLin.ticks(narrow ? 4 : 6);

  const labelPts = useMemo(() => {
    if (!labels || !mounted || !settled) return [];
    const family = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "sans-serif";
    return placeLabels(shownPts, frontSet, iw, ih, family);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels, mounted, settled, pts, frontier, iw, ih, fontKey]);

  const pointer = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const k = iw / box.width;
    const px = (e.clientX - box.left) * k;
    const py = (e.clientY - box.top) * (ih / box.height);
    let best: Pt | null = null;
    let bd = HIT * HIT;
    for (const p of shownPts) {
      const d = (p.px - px) ** 2 + (p.py - py) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    const wrap = e.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
    setMouse(wrap ? { x: e.clientX - wrap.left, y: e.clientY - wrap.top } : null);
    return best;
  };
  const onMove = (e: React.PointerEvent<SVGRectElement>) => setHover(pointer(e));
  const onDown = (e: React.PointerEvent<SVGRectElement>) => {
    const p = pointer(e);
    armed.current = e.pointerType !== "touch" || (p != null && hover != null && p.m.slug === hover.m.slug);
    setHover(p);
  };
  const onClick = () => {
    if (armed.current && hover && labPages.includes(hover.m.lab)) router.push(`/labs/${hover.m.lab}/`);
  };

  const inView = visible.filter((v) => inAge(v.m));
  const withPlan = inView.filter((v) => v.pick).length;
  const mults = inView.map((v) => v.pick?.multiplier).filter((x): x is number => x != null).sort((a, b) => a - b);
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

  const scaleName = log ? "Log" : "Linear";
  const linkable = hover != null && labPages.includes(hover.m.lab);

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
          {withPlan} of {inView.length} shown variants have a plan{median != null && <> · median subsidy {fmtX(median)}</>}
        </p>
      </div>

      {/* time travel: the lineup as it stood on any past day */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-rule px-4 py-2.5 text-xs">
        <span className="text-ink-3">Lineup as of</span>
        <span className="tabular min-w-[92px] text-sm font-medium text-ink">{fmtLongDate(asOfN)}</span>
        <button type="button" aria-label="One day earlier" disabled={back >= span} onClick={() => setBack((b) => Math.min(span, b + 1))} className={STEP}>‹</button>
        <input
          type="range"
          min={0}
          max={span}
          step={1}
          value={span - Math.min(back, span)}
          onChange={(e) => setBack(span - Number(e.target.value))}
          aria-label="Chart date"
          aria-valuetext={fmtLongDate(asOfN)}
          className="min-w-[140px] flex-1 accent-current"
        />
        <button type="button" aria-label="One day later" disabled={back <= 0} onClick={() => setBack((b) => Math.max(0, b - 1))} className={STEP}>›</button>
        <button
          type="button"
          disabled={back === 0}
          onClick={() => setBack(0)}
          className="rounded-full border border-rule px-3 py-1 text-ink-2 transition-colors enabled:hover:border-ink-3 enabled:hover:text-ink disabled:opacity-40"
        >
          Today
        </button>
        <span className="tabular text-ink-3">{models.length} of {allModels.length} models out</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-ink-3">Cost axis</span>
          <Tabs options={[{ key: "log", label: "Log" }, { key: "lin", label: "Linear" }]} value={log ? "log" : "lin"} onChange={(k) => setLog(k === "log")} className="" />
        </div>
        <Check on={frontier} set={setFrontier}>Pareto line</Check>
        <Check on={labels} set={setLabels}>Labels</Check>
        <button
          type="button"
          aria-pressed={relevantOnly}
          onClick={() => setRelevantOnly((v) => !v)}
          title="Keep the Pareto frontier plus each lab's two most competitive releases (highest reasoning effort)"
          className={`rounded-full border px-3 py-1.5 transition-colors ${relevantOnly ? "border-ink bg-ink text-page" : "border-rule text-ink-2 hover:border-ink-3 hover:text-ink"}`}
        >
          Relevant models only{relevantOnly && <span className="tabular ml-1.5 opacity-70">{relevant.size}</span>}
        </button>
        <button
          type="button"
          aria-pressed={past}
          onClick={() => setPast((v) => !v)}
          title="Add every retired model that has a documented release date, lab, index score and cost per task"
          className={`rounded-full border px-3 py-1.5 transition-colors ${past ? "border-ink bg-ink text-page" : "border-rule text-ink-2 hover:border-ink-3 hover:text-ink"}`}
        >
          All past models{past && <span className="tabular ml-1.5 opacity-70">+{archive.length}</span>}
        </button>
        <button
          type="button"
          aria-pressed={ageMode}
          onClick={() => setAgeMode((v) => !v)}
          title="Color dots by how long before the chart date each model launched"
          className={`rounded-full border px-3 py-1.5 transition-colors ${ageMode ? "border-ink bg-ink text-page" : "border-rule text-ink-2 hover:border-ink-3 hover:text-ink"}`}
        >
          Color by release age
        </button>
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

      <div className={`mb-3 flex flex-wrap items-center gap-1.5 text-xs transition-opacity ${relevantOnly ? "pointer-events-none opacity-40" : ""}`} role="group" aria-label="Reasoning effort" aria-disabled={relevantOnly}>
        <span className="mr-1 text-ink-3">Reasoning effort:{relevantOnly && " highest per model (relevant view)"}</span>
        {efforts.map((e) => {
          const on = selEfforts.includes(e);
          return (
            <button
              key={e}
              type="button"
              aria-pressed={on}
              disabled={relevantOnly}
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

      {/* legend, as on AA: the attractive quadrant and the Pareto line */}
      <div className="mb-2 ml-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
        <div className="flex items-center gap-2">
          <div className="h-3 w-4 shrink-0 rounded-sm border" style={{ background: "var(--aa-good)", borderColor: "var(--aa-good-edge)" }} />
          <span>Most attractive quadrant</span>
        </div>
        <div className="flex items-center gap-2">
          <svg aria-hidden="true" width="20" height="8" viewBox="0 0 20 8">
            <line x1="1.25" y1="4" x2="18.75" y2="4" stroke="var(--aa-pareto)" strokeWidth="2.5" strokeDasharray="0.1 5.6" strokeLinecap="round" />
          </svg>
          <span>Pareto line</span>
        </div>
      </div>

      {ageMode && (
        <div className="mb-3 ml-1 max-w-[520px] text-xs text-ink-3">
          <div className="mb-1">Dot color: release age before {fmtLongDate(asOfN)}</div>
          <div className="age-range relative h-5">
            <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full" style={{ background: `linear-gradient(to right, ${Array.from({ length: 21 }, (_, i) => ageColor(i / 20)).join(",")})` }}>
              <div className="absolute inset-y-0 left-0 bg-page/75" style={{ width: `${rng[0] / 10}%` }} />
              <div className="absolute inset-y-0 right-0 bg-page/75" style={{ width: `${100 - rng[1] / 10}%` }} />
            </div>
            <input
              type="range" min={0} max={1000} step={1} value={rng[0]} aria-label="Newest release shown"
              aria-valuetext={`${fmtLongDate(asOfN - Math.round(ageLoD))}`}
              onChange={(e) => setRng(([, hi]) => [Math.min(Number(e.target.value), hi - 12), hi])}
            />
            <input
              type="range" min={0} max={1000} step={1} value={rng[1]} aria-label="Oldest release shown"
              aria-valuetext={`${fmtLongDate(asOfN - Math.round(ageHiD))}`}
              onChange={(e) => setRng(([lo]) => [lo, Math.max(Number(e.target.value), lo + 12)])}
            />
          </div>
          <div className="relative mt-1 h-4">
            {AGE_TICKS.filter(([d]) => d === 0 || d <= maxAge).map(([d, label]) => (
              <span key={d} className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0" style={{ left: `${ageFrac(d, maxAge) * 100}%` }}>{label}</span>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular text-ink-2">
              {windowed
                ? `Showing releases from ${fmtLongDate(asOfN - Math.round(ageHiD))} to ${fmtLongDate(asOfN - Math.round(ageLoD))} · ${inView.length} models`
                : "Drag either end to keep only releases in an age window"}
            </span>
            {windowed && (
              <button type="button" onClick={() => setRng([0, 1000])} className="rounded-full border border-rule px-2.5 py-0.5 text-ink-2 hover:border-ink-3 hover:text-ink">
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={ref} className="relative w-full">
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="viz block h-auto max-w-full" role="img" aria-label="Intelligence Index versus cost per task for current models">
          <defs>
            <clipPath id={clipId}>
              <rect width={Math.max(0, iw)} height={ih} />
            </clipPath>
          </defs>
          <g transform={`translate(${MG.left},${MG.top})`}>
            {/* quadrants: cheap + smart (top-left) and dear + weak (bottom-right) */}
            <g pointerEvents="none">
              <rect x={0} y={0} width={iw / 2} height={ih / 2} style={{ fill: "var(--aa-good)" }} />
              <rect x={iw / 2} y={ih / 2} width={iw / 2} height={ih / 2} style={{ fill: "var(--aa-bad)" }} />
            </g>

            {/* axes: tick marks and labels only, no grid or axis lines */}
            <g style={{ stroke: "var(--aa-tick)" }} fill="none">
              {yTicks.map((v) => (
                <line key={`yt${v}`} x1={-4} x2={0} y1={Y(v)} y2={Y(v)} />
              ))}
              {logT.map((v) => (
                <line key={`xl${v}`} x1={X(v)} x2={X(v)} y1={ih} y2={ih + 4} opacity={s} />
              ))}
              {linT.map((v) => (
                <line key={`xn${v}`} x1={X(v)} x2={X(v)} y1={ih} y2={ih + 4} opacity={1 - s} />
              ))}
            </g>
            <g style={{ fill: "var(--aa-tick)" }}>
              {yTicks.map((v) => (
                <text key={`yl${v}`} x={-10} y={Y(v)} dy="0.355em" textAnchor="end">{v}</text>
              ))}
              {logT.map((v) => (
                <text key={`xlt${v}`} x={X(v)} y={ih + 10} dy="0.71em" textAnchor="middle" opacity={s}>{tickLabel(v)}</text>
              ))}
              {linT.map((v) => (
                <text key={`xnt${v}`} x={X(v)} y={ih + 10} dy="0.71em" textAnchor="middle" opacity={1 - s}>{tickLabel(v)}</text>
              ))}
            </g>
            <g style={{ fill: "var(--aa-axis-title)", fontSize: 13 }}>
              <text x={iw / 2} y={ih + MG.bottom - 10} textAnchor="middle" style={{ fontSize: 13, fill: "var(--aa-axis-title)" }}>
                {narrow
                  ? `Cost per Task (USD, ${scaleName} Scale)`
                  : `Cost per Task${subsidy ? " through the best coding plan" : ""} (USD, ${scaleName} Scale)`}
              </text>
              <text transform={`translate(${-MG.left + 10},${ih / 2}) rotate(-90)`} dy="0.355em" textAnchor="middle" style={{ fontSize: 13, fill: "var(--aa-axis-title)" }}>
                Artificial Analysis Intelligence Index
              </text>
            </g>

            {/* slide trails: where each subsidized dot came from */}
            {t > 0.01 &&
              shownPts.filter((p) => p.pick).map((p) => (
                <line key={`tr${p.m.slug}`} x1={Math.min(X(p.m.cost_per_task), iw - DOT_R - 1)} x2={p.px} y1={p.py} y2={p.py} stroke={dotColor(p.m)} strokeOpacity={0.28 * t} strokeWidth={1.5} strokeDasharray="2 3" />
              ))}

            {windowed && allFront.length > 1 && (
              <g clipPath={`url(#${clipId})`} pointerEvents="none">
                <path d={ghostPath} fill="none" strokeWidth={1.5} strokeDasharray="1 5" strokeLinecap="round" strokeLinejoin="round" opacity={0.45} style={{ stroke: "var(--aa-pareto)" }} />
              </g>
            )}

            {front.length > 1 && (
              <g clipPath={`url(#${clipId})`} pointerEvents="none">
                <path key={front.map((p) => p.m.slug).join()} className={windowed ? "pf-in" : undefined} d={frontPath} fill="none" strokeWidth={2.5} strokeDasharray="0.1 6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aa-pareto)" }} />
              </g>
            )}

            {fadedPts.map((p) => (
              <circle key={`f${p.m.slug}`} cx={p.px} cy={p.py} r={DOT_R} fill={dotColor(p.m)} opacity={FADED} pointerEvents="none" />
            ))}

            {pts.filter((p) => p.fit).map((p) => {
              const dim = p.inAge ? (!p.pick ? 1 - 0.6 * t : 1) : 0;
              return (
                <circle
                  key={p.m.slug}
                  cx={p.px}
                  cy={p.py}
                  r={p.inAge ? DOT_R : 0}
                  fill={dotColor(p.m)}
                  opacity={dim}
                  pointerEvents="none"
                  style={{ transition: "r 280ms cubic-bezier(.3,1.4,.5,1), opacity 220ms ease-out, fill 200ms" }}
                />
              );
            })}

            {/* labels: leader hairline when the name sits away from its dot; the hovered name goes solid */}
            <g pointerEvents="none" aria-hidden="true" style={{ transition: "opacity 200ms" }} opacity={settled ? 1 : 0}>
              {labelPts.map((l) => (
                <g key={`lb${l.p.m.slug}`}>
                  {l.leader && <line x1={l.leader[0]} y1={l.leader[1]} x2={l.leader[2]} y2={l.leader[3]} strokeWidth={1} style={{ stroke: "var(--aa-leader)" }} />}
                  <text
                    x={l.box.x0}
                    y={l.box.y0}
                    dominantBaseline="hanging"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    style={{
                      fill: hover?.m.slug === l.p.m.slug ? "var(--aa-label-hover)" : "var(--aa-label)",
                      stroke: "var(--aa-halo)",
                      paintOrder: "stroke",
                      fontSize: 11,
                      fontWeight: 400,
                    }}
                  >
                    {l.text}
                  </text>
                </g>
              ))}
            </g>

            <rect
              width={Math.max(0, iw)}
              height={ih}
              fill="transparent"
              style={{ cursor: hover ? "pointer" : "default", pointerEvents: "all", touchAction: "pan-y" }}
              onPointerMove={onMove}
              onPointerDown={onDown}
              onPointerLeave={() => { setHover(null); setMouse(null); }}
              onClick={onClick}
            />
          </g>
        </svg>

        {hover && mouse && (
          <div
            className="pointer-events-none absolute z-10 w-max"
            style={{ left: mouse.x + 12 + 250 > width ? Math.max(0, mouse.x - 12 - 250) : mouse.x + 12, top: mouse.y + 12 }}
          >
            <div
              className="max-w-[320px] rounded-md border p-2 text-xs shadow-sm"
              style={{ background: "var(--aa-tip-bg)", borderColor: "var(--aa-tip-border)", color: "var(--aa-tip-ink)" }}
            >
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor(hover.m) }} />
                <span className="text-balance">{hover.m.name}</span>
              </div>
              <div className="flex flex-col gap-1">
                <TipRow k={`Cost per Task (USD, ${scaleName} Scale)`} v={fmtCost(hover.pick && subsidy ? hover.pick.cost : hover.m.cost_per_task)} />
                <TipRow k="Artificial Analysis Intelligence Index" v={`${Math.round(hover.m.intelligence)}${hover.m.estimated ? "*" : ""}`} />
                {retired.has(hover.m.slug) && <TipRow k="Status" v="Retired" />}
                {meta[hover.m.release] && <TipRow k="Released" v={fmtLongDate(relDay.get(hover.m.release) ?? asOfN)} />}
                {subsidy && hover.pick && (
                  <>
                    <TipRow k="API cost per task" v={fmtCost(hover.m.cost_per_task)} />
                    <TipRow k="Best plan" v={`${hover.pick.plan.product} ${hover.pick.plan.plan}`} />
                    <TipRow k="Plan price" v={`$${hover.pick.plan.price_usd.toFixed(hover.pick.plan.price_usd % 1 ? 2 : 0)}/mo · ${hover.pick.plan.region === "china" ? "China" : "global"}`} />
                    <TipRow k="Subsidy" v={fmtX(hover.pick.multiplier)} />
                    {hover.pick.confidence && <TipRow k="Confidence" v={hover.pick.confidence} />}
                  </>
                )}
                {subsidy && !hover.pick && (
                  <p style={{ color: "var(--aa-tip-hint)" }}>No eligible coding plan{region !== "all" ? ` in ${region === "china" ? "China" : "global"} plans` : ""}: API price only.</p>
                )}
              </div>
              {linkable && (
                <div className="mt-1 text-[10px]" style={{ color: "var(--aa-tip-hint)" }}>Click for more info</div>
              )}
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        {windowed && <span>Dotted line behind: the frontier of every model, for comparison</span>}
        <span>Faded dots on the line: cheapest-and-smartest models your filters hide</span>
        {subsidy && <span>Paler dots: no eligible plan, so they keep their API price</span>}
        <span>* estimated index</span>
        {pinned > 0 && <span>{pinned} dearer {pinned === 1 ? "model is" : "models are"} pinned to the right edge: switch to the log axis to see {pinned === 1 ? "its" : "their"} true cost</span>}
      </p>
    </div>
  );
}

const STEP = "grid h-7 w-7 place-items-center rounded-full border border-rule text-ink-2 transition-colors enabled:hover:border-ink-3 enabled:hover:text-ink disabled:opacity-40";

function Check({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5 text-ink-2 hover:text-ink">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-current" />
      {children}
    </label>
  );
}

function TipRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-balance leading-tight">{k}</span>
      <span className="shrink-0 whitespace-nowrap font-medium leading-tight" style={{ color: "var(--aa-tip-strong)" }}>{v}</span>
    </div>
  );
}
