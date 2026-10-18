"use client";

import { useState } from "react";

import type { LeaderSpan, RaceEvent } from "@/lib/race";

import { HealthChart, type Series } from "./HealthChart";
import { Tabs } from "./Tabs";

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
  leaders,
  events,
}: {
  dates: string[];
  labs: { lab: string; name: string; metrics: Record<Metric, (number | null)[]> }[];
  initial: string[];
  leaders?: LeaderSpan[];
  events?: RaceEvent[];
}) {
  const [metric, setMetric] = useState<Metric>("health");
  // Selection lives here so it survives metric switches (the chart is never remounted).
  const [shown, setShown] = useState<string[]>(initial);
  const m = METRICS.find((x) => x.key === metric)!;
  const series: Series[] = labs.map((l) => ({
    lab: l.lab,
    name: l.name,
    values: l.metrics[metric].map((v) => (v == null ? null : v * m.scale)),
  }));
  return (
    <div>
      <Tabs options={METRICS.map((x) => ({ key: x.key, label: x.label }))} value={metric} onChange={(k) => setMetric(k as Metric)} />
      <HealthChart dates={dates} series={series} shown={shown} onShownChange={setShown} height={420} metric={m.label} domain={m.domain} fmt={m.fmt} leaders={leaders} events={events} />
    </div>
  );
}
