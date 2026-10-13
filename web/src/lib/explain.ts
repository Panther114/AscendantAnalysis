// Deterministic plain-language explanations built only from exported numbers.
import { labName, leaderboard, releaseName, releases, variantName } from "./data";
import type { LabScore, Lead } from "./types";

function usd(x: number) {
  return x >= 1 ? `$${x.toFixed(2)}` : `$${x.toFixed(3)}`;
}

export function describeLead(l: Lead): string {
  const rival = labName(l.rival_lab);
  const own = l.lab_variant ? `(own best: ${variantName(l.lab_variant)})` : "";
  if (l.score == null) {
    if (l.axis === "efficiency") return "No model within 12 points of the frontier, so it doesn't contest near-frontier cost.";
    if (l.axis === "value") return "No model in the value zone (13–25 points below the frontier).";
    return "Not enough data.";
  }
  switch (l.axis) {
    case "intelligence":
      if (l.margin == null) return "Only lab with an active model.";
      return l.margin >= 0
        ? `Best model is ${l.margin.toFixed(1)} points ahead of ${rival}'s best ${own}.`
        : `Best model is ${Math.abs(l.margin).toFixed(1)} points behind ${rival}'s best ${own}.`;
    case "efficiency":
    case "value": {
      const zone = l.axis === "efficiency" ? "near-frontier" : "value-zone";
      if (l.margin == null) return `Reaches ${zone} levels no rival reaches at any price.`;
      const r = Math.exp(Math.abs(l.margin));
      return l.margin >= 0
        ? `At its strongest ${zone} level it's ${r.toFixed(1)}× cheaper than ${rival} (${usd(l.lab_value ?? 0)} vs ${usd(l.rival_value ?? 0)}).`
        : `At its best ${zone} level it's still ${r.toFixed(1)}× pricier than ${rival} (${usd(l.lab_value ?? 0)} vs ${usd(l.rival_value ?? 0)}).`;
    }
    case "speed": {
      if (l.margin == null) return "Fastest relevant model; no rival has speed data.";
      const r = Math.exp(Math.abs(l.margin));
      return l.margin >= 0
        ? `Fastest relevant model: ${r.toFixed(1)}× ${rival}'s best (${l.lab_value?.toFixed(0)} vs ${l.rival_value?.toFixed(0)} tok/s).`
        : `${r.toFixed(1)}× slower than ${rival}'s fastest relevant model (${l.lab_value?.toFixed(0)} vs ${l.rival_value?.toFixed(0)} tok/s).`;
    }
  }
}

export interface Driver {
  label: string;
  delta: number; // in health points, approximately attributed
}

/**
 * Splits the day-over-day health change into multiplicative factors (log attribution):
 * H = 100 · Core · M · F, so Δlog H = Δlog Core + Δlog M + Δlog F, scaled to points.
 */
export function changeDrivers(s: LabScore): Driver[] {
  if (!s.prev || s.prev_health == null || s.prev_health <= 0 || s.health <= 0) return [];
  const total = s.health - s.prev_health;
  const parts = [
    { label: "Leadership & lineup (core)", v: Math.log(s.core / s.prev.core) },
    { label: "Momentum", v: Math.log(s.momentum / s.prev.momentum) },
    { label: "Freshness", v: Math.log(s.freshness_multiplier / s.prev.freshness_multiplier) },
  ];
  const sum = parts.reduce((a, p) => a + p.v, 0);
  if (Math.abs(sum) < 1e-9) return [];
  return parts.map((p) => ({ label: p.label, delta: (total * p.v) / sum })).filter((d) => Math.abs(d.delta) >= 0.05);
}

/** Material releases from any lab in the 7 days up to the snapshot date. */
export function recentReleases(snapshotDate: string, days = 7) {
  const end = new Date(`${snapshotDate}T00:00:00Z`).getTime();
  return Object.entries(releases)
    .filter(([, r]) => {
      const t = new Date(`${r.date}T00:00:00Z`).getTime();
      return r.material && t <= end && end - t <= days * 864e5;
    })
    .map(([slug, r]) => ({ slug, ...r }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

export function rankOf(lab: string) {
  return leaderboard.findIndex((s) => s.lab === lab) + 1;
}

export { releaseName };
