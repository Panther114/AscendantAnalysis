"use client";

import { useState } from "react";

import { HealthChart, type Series } from "./HealthChart";

type Metric = "health" | "leadership" | "lineup" | "momentum" | "freshness";

const METRICS: { key: Metric; label: string; domain: [number, number]; fmt: (v: number) => string; scale: number }[] = [
  { key: "health", label: "Health", domain: [0, 100], fmt: (v) => v.toFixed(1), scale: 1 },
  { key: "leadership", label: "Leadership", domain: [0, 100], fmt: (v) => v.toFixed(0), scale: 100 },
  { key: "lineup", label: "Lineup", domain: [0, 100], fmt: (v) => v.toFixed(0), scale: 100 },
  { key: "momentum", label: "Momentum ×", domain: [0.8, 1.2], fmt: (v) => `×${v.toFixed(2)}`, scale: 1 },
  { key: "freshness", label: "Freshness ×", domain: [0.6, 1], fmt: (v) => `×${v.toFixed(2)}`, scale: 1 },
];

export function MetricHistory({
  dates,
  labs,
  initial,
}: {
  dates: string[];
  labs: { lab: string; name: string; metrics: Record<Metric, (number | null)[]> }[];
  initial: string[];
}) {
  const [metric, setMetric] = useState<Metric>("health");
  const m = METRICS.find((x) => x.key === metric)!;
  const series: Series[] = labs.map((l) => ({
    lab: l.lab,
    name: l.name,
    values: l.metrics[metric].map((v) => (v == null ? null : v * m.scale)),
  }));
  return (
    <div>
      <div className="mb-4 flex max-w-full overflow-x-auto [scrollbar-width:none]"><div className="inline-flex shrink-0 rounded-full bg-sunken p-1 text-[13px]" role="tablist">
        {METRICS.map((x) => (
          <button
            key={x.key}
            role="tab"
            type="button"
            aria-selected={metric === x.key}
            onClick={() => setMetric(x.key)}
            className={`rounded-full px-3 py-1.5 transition-colors ${metric === x.key ? "bg-raised text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"}`}
          >
            {x.label}
          </button>
        ))}
      </div></div>
      <HealthChart key={metric} dates={dates} series={series} initial={initial} height={420} metric={m.label} domain={m.domain} fmt={m.fmt} />
    </div>
  );
}
