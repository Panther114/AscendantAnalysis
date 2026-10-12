import type { ExplorerMetric, ExplorerRow } from "@/components/charts/IndexExplorer";
import { labs, leaderboard } from "./data";

const lead = (axis: string) => (s: (typeof leaderboard)[number]) => {
  const l = s.leads.find((x) => x.axis === axis);
  return l?.score == null ? null : l.score * 100;
};

export const EXPLORER_METRICS: ExplorerMetric[] = [
  { key: "health", label: "Health Index", subtitle: "Ascendant Health Index, 0–100 · Higher is better", domain: [0, 100], digits: 0 },
  { key: "leadership", label: "Frontier Leadership", subtitle: "Lead over the single best rival on intelligence, cost or speed, 0–100 · Higher is better", domain: [0, 100], digits: 0 },
  { key: "lineup", label: "Lineup Strength", subtitle: "Best tier plus breadth across frontier, mid and small, 0–100 · Higher is better", domain: [0, 100], digits: 0 },
  { key: "momentum", label: "Momentum", subtitle: "Multiplier from the trend of at-release competitiveness, ×0.80–1.20 · Higher is better", domain: [0.8, 1.2], digits: 2, prefix: "×" },
  { key: "freshness", label: "Freshness", subtitle: "Multiplier from days since the last material release, ×0.60–1.00 · Higher is better", domain: [0.6, 1], digits: 2, prefix: "×" },
  { key: "intelligence", label: "Intelligence lead", subtitle: "Best model vs. the best rival model, sigmoid-mapped, 50 = even · Higher is better", domain: [0, 100], digits: 0 },
  { key: "efficiency", label: "Efficiency lead", subtitle: "Cheapest at capability levels within 12 points of the frontier, 50 = even · Higher is better", domain: [0, 100], digits: 0 },
  { key: "value", label: "Value lead", subtitle: "Cheapest at capability levels 13–25 points below the frontier, 50 = even · Higher is better", domain: [0, 100], digits: 0 },
  { key: "speed", label: "Speed lead", subtitle: "Fastest model within 20 points of the frontier vs. the fastest rival, 50 = even · Higher is better", domain: [0, 100], digits: 0 },
];

export function explorerRows(): ExplorerRow[] {
  return leaderboard.map((s) => ({
    lab: s.lab,
    name: labs[s.lab]?.name ?? s.lab,
    band: s.band,
    values: {
      health: s.health,
      leadership: s.leadership * 100,
      lineup: s.lineup * 100,
      momentum: s.momentum,
      freshness: s.freshness_multiplier,
      intelligence: lead("intelligence")(s),
      efficiency: lead("efficiency")(s),
      value: lead("value")(s),
      speed: lead("speed")(s),
    },
  }));
}
