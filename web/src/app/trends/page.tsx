import type { Metadata } from "next";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { MetricHistory } from "@/components/charts/MetricHistory";
import { Card, InfoNote, PageHeader } from "@/components/ui";
import { featuredLabs, history, labs, leaderboard } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Trends" };

export default function TrendsPage() {
  const featured = featuredLabs();
  const n = history.dates.length;
  const idx13 = Math.max(0, n - 14);
  const changes = leaderboard
    .map((s) => {
      const then = history.labs[s.lab].health[idx13];
      return { lab: s.lab, d: then == null ? null : s.health - then, then };
    })
    .filter((r): r is { lab: string; d: number; then: number } => r.d != null)
    .sort((a, b) => b.d - a.d);
  const risers = changes.slice(0, 8);
  const fallers = changes.slice(-8).reverse();

  return (
    <div className="rise">
      <PageHeader eyebrow="Trends" title="Health over time">
        Every Monday is rescored using only the models released by then. History is reconstructed from today&apos;s snapshot, so
        all weeks share one Intelligence Index version and current prices.
      </PageHeader>

      <Card title="Weekly replay" keyColor="blue" subtitle="Switch metric to see which pillar drove each move">
        <MetricHistory
          dates={history.dates}
          initial={featured.slice(0, 5)}
          labs={featured.map((lab) => ({
            lab,
            name: labs[lab].name,
            metrics: {
              health: history.labs[lab].health,
              leadership: history.labs[lab].leadership,
              lineup: history.labs[lab].lineup,
              momentum: history.labs[lab].momentum,
              freshness: history.labs[lab].freshness,
            },
          }))}
        />
        <InfoNote>
          Replay starts {fmtDate(history.dates[0])}. Before that, many now-deprecated models lack prices and speeds in the source
          data, which would make tiers and cost leads unreliable.
        </InfoNote>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Rising" keyColor="green" subtitle="Change in health over 13 weeks · points">
          <ColumnChart data={risers.map((r) => ({ lab: r.lab, value: Math.max(0, r.d), detail: `from ${r.then.toFixed(1)}` }))} format={(v) => `+${v.toFixed(1)}`} />
        </Card>
        <Card title="Falling" keyColor="orange" subtitle="Change in health over 13 weeks · points">
          <ColumnChart data={fallers.map((r) => ({ lab: r.lab, value: Math.max(0, -r.d), detail: `from ${r.then.toFixed(1)}` }))} format={(v) => `−${v.toFixed(1)}`} />
        </Card>
      </div>
    </div>
  );
}
