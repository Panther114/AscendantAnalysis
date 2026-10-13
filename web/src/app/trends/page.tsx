import type { Metadata } from "next";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { MetricHistory } from "@/components/charts/MetricHistory";
import { Card, InfoNote, PageHeader } from "@/components/ui";
import { history, labs, leaderboard, rankedLabs } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Trends" };

export default function TrendsPage() {
  const ranked = rankedLabs();
  const n = history.dates.length;
  const idx13 = Math.max(0, n - 92);
  const changes = leaderboard
    .map((s) => {
      const then = history.labs[s.lab]?.health[idx13] ?? null;
      return { lab: s.lab, d: then == null ? null : s.health - then, then };
    })
    .filter((r): r is { lab: string; d: number; then: number } => r.d != null);
  // Only genuine movers: a lab that fell must never appear under "Rising" (and vice versa).
  const risers = changes.filter((r) => r.d >= 0.05).sort((a, b) => b.d - a.d);
  const fallers = changes.filter((r) => r.d <= -0.05).sort((a, b) => a.d - b.d);

  return (
    <div className="rise">
      <PageHeader eyebrow="Trends" title="Health over time">
        Every day is rescored using only the models released by then. History is reconstructed from today&apos;s snapshot, so
        all days share one Intelligence Index version and current prices.
      </PageHeader>

      <Card title="Daily replay" keyColor="blue" subtitle={`All ${ranked.length} ranked labs · your selection is kept when you switch metric`}>
        <MetricHistory
          dates={history.dates}
          initial={ranked.slice(0, 5)}
          labs={ranked.map((lab) => ({
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
          data, which would make tiers and cost leads unreliable. Gaps mean the lab wasn&apos;t ranked that day.
        </InfoNote>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Rising" keyColor="green" subtitle={`Labs whose health rose over 13 weeks (${risers.length}) · points`}>
          {risers.length ? (
            <ColumnChart data={risers.map((r) => ({ lab: r.lab, value: r.d, detail: `from ${r.then.toFixed(1)}` }))} format={(v) => `+${v.toFixed(1)}`} />
          ) : (
            <p className="text-sm text-ink-2">No lab rose over this period.</p>
          )}
        </Card>
        <Card title="Falling" keyColor="orange" subtitle={`Labs whose health fell over 13 weeks (${fallers.length}) · points`}>
          {fallers.length ? (
            <ColumnChart data={fallers.map((r) => ({ lab: r.lab, value: -r.d, detail: `from ${r.then.toFixed(1)}` }))} format={(v) => `−${v.toFixed(1)}`} />
          ) : (
            <p className="text-sm text-ink-2">No lab fell over this period.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
