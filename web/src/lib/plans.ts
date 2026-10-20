// Pure helpers for the Cost & Plans page, shared by server components and the client chart.
import type { CodingPlan, CostModel, Effort } from "./types";

export type Region = "all" | "global" | "china";

export const EFFORT_ORDER: Effort[] = ["Max", "Xhigh", "High", "Medium", "Low", "Minimal", "Reasoning", "Default", "Non-reasoning"];

export interface PlanPick {
  plan: CodingPlan;
  multiplier: number;
  basis: string | null;
  confidence: string | null;
  cost: number; // subsidized cost per task
}

// Mirrors pipeline CONFIDENCE_WEIGHT: a derived/estimated multiplier is discounted when ranking plans,
// so a generic figure can't outrank an official or measured per-model one by being bigger.
const CONFIDENCE_WEIGHT: Record<string, number> = { official: 1, measured: 1, derived: 0.85, estimate: 0.6, unknown: 0.5 };
const rankValue = (multiplier: number, confidence: string | null) => multiplier * (CONFIDENCE_WEIGHT[confidence ?? ""] ?? 1);

/** Every eligible plan that serves this model's release, best (largest confidence-weighted multiplier) first. */
export function plansFor(m: CostModel, plans: CodingPlan[], region: Region = "all"): PlanPick[] {
  const out: PlanPick[] = [];
  for (const p of plans) {
    if (!p.eligible || (region !== "all" && p.region !== region)) continue;
    const e = p.models.find((x) => x.release === m.release);
    if (!e?.multiplier) continue;
    out.push({ plan: p, multiplier: e.multiplier, basis: e.basis, confidence: e.confidence, cost: m.cost_per_task / e.multiplier });
  }
  // ties: cheaper plan, then id (matches the pipeline's best_plans)
  return out.sort((a, b) => rankValue(b.multiplier, b.confidence) - rankValue(a.multiplier, a.confidence) || a.plan.price_usd - b.plan.price_usd || a.plan.id.localeCompare(b.plan.id));
}

/** The best plan, if it beats the API at all: a plan worth ×1 or less is no subsidy (matches the pipeline). */
export function bestPlan(m: CostModel, plans: CodingPlan[], region: Region = "all"): PlanPick | null {
  const top = plansFor(m, plans, region)[0];
  return top && top.multiplier > 1 ? top : null;
}

/** Multiplier range a plan offers across its lineup, e.g. "×6" or "×1.5–×12". */
export function multiplierRange(p: CodingPlan): string {
  const ms = p.models.map((m) => m.multiplier).filter((x): x is number => x != null);
  if (!ms.length) return p.default_multiplier ? fmtX(p.default_multiplier) : "—";
  const lo = Math.min(...ms);
  const hi = Math.max(...ms);
  return lo === hi ? fmtX(lo) : `${fmtX(lo)}–${fmtX(hi).slice(1)}`;
}

export function fmtX(x: number): string {
  return `×${x >= 10 ? x.toFixed(0) : x >= 2 ? x.toFixed(1) : x.toFixed(2)}`;
}

export function usdTask(x: number): string {
  if (x >= 10) return `$${x.toFixed(1)}`;
  if (x >= 1) return `$${x.toFixed(2)}`;
  if (x >= 0.01) return `$${x.toFixed(3)}`;
  return `$${x.toPrecision(2)}`;
}

/** Pareto frontier: walking up in cost, keep points that raise the best intelligence. */
export function pareto<T extends { x: number; y: number }>(pts: T[]): T[] {
  const sorted = [...pts].sort((a, b) => a.x - b.x || b.y - a.y);
  const out: T[] = [];
  let best = -Infinity;
  for (const p of sorted) if (p.y > best) { out.push(p); best = p.y; }
  return out;
}
