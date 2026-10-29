import type { Metadata } from "next";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { MetricHistory } from "@/components/charts/MetricHistory";
import { Card, InfoNote, PageHeader } from "@/components/ui";
import { history, labName, labs, leaderboard, meta, rankedLabs, releases } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { leaderSpans, raceEvents, SURGE_POINTS } from "@/lib/race";

export const metadata: Metadata = { title: "Trends" };

export default function TrendsPage() {
  const ranked = rankedLabs();
  const leaders = leaderSpans(history, labName);
  const events = raceEvents(history, releases, labName);
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
      <PageHeader eyebrow="Lab Index · Trends" title="Health over time">
        Every day is rescored using only the models released by then. History is reconstructed from today&apos;s snapshot, so
        all days share one Intelligence Index version (v{meta.index_version}) and current prices. Models Artificial Analysis has not
        rescored on that version are excluded, so the series begins with the first priced v{meta.index_version} release.
      </PageHeader>

      <Card title="Daily replay" keyColor="blue" subtitle={`All ${ranked.length} ranked labs · your selection is kept when you switch metric`}>
        <MetricHistory
          dates={history.dates}
          initial={ranked.slice(0, 5)}
          leaders={leaders}
          events={events}
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
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
          <span className="text-ink-2">{events.length} releases moved the race:</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-full bg-ink" /> took #1 in health</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-full border border-ink-2" /> entered the top 3</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-full border border-rule" /> surged {SURGE_POINTS}+ points in a day into the top 8</span>
          <span>· hover a release for details · the band above shows the #1 lab each day</span>
        </p>
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
