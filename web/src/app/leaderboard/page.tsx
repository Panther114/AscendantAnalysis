import type { Metadata } from "next";

import { IndexExplorer } from "@/components/charts/IndexExplorer";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { BandBadge, Card, Delta, LabLink, LabLogo, MoreLink, PageHeader } from "@/components/ui";
import { ViewSwitch } from "@/components/ViewSwitch";
import { field, labName, leaderboard, meta } from "@/lib/data";
import { EXPLORER_METRICS, explorerRows } from "@/lib/explorer";
import { fmtDate, fmtHealth, TIER_LABEL } from "@/lib/format";
import type { Tier } from "@/lib/types";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  const movers = leaderboard
    .filter((s) => s.prev_health != null)
    .map((s) => ({ s, d: s.health - (s.prev_health as number) }))
    .filter((m) => Math.abs(m.d) >= 0.05)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 10);
  const byslug = Object.fromEntries(field.releases.map((r) => [r.slug, r]));

  return (
    <div className="rise">
      <PageHeader eyebrow={`Lab Index · As of ${fmtDate(meta.snapshot_date)}`} title="Leaderboard">
        Every ranked lab by Health: how strong, competitive and current its model lineup is against rivals. Switch to the chart
        view to re-sort the field by any component.
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          {["Ascendant", "Contending", "Competitive", "Trailing", "Peripheral"].map((b) => (
            <BandBadge key={b} band={b} />
          ))}
          <span className="text-xs text-ink-3">≥80 · ≥65 · ≥50 · ≥35 · below</span>
        </div>
      </PageHeader>

      <Card
        title={`All ${leaderboard.length} ranked labs`}
        keyColor="ink"
        subtitle="Health = Core (leadership ⊕ lineup) × momentum × freshness · Select a lab for its full breakdown"
        action={<MoreLink href="/methodology/">Methodology</MoreLink>}
      >
        <ViewSwitch
          views={[
            { key: "table", label: "Table", node: <div className="-mx-5"><LeaderboardTable scores={leaderboard} /></div> },
            { key: "chart", label: "Chart by component", node: <IndexExplorer rows={explorerRows()} metrics={EXPLORER_METRICS} /> },
          ]}
        />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card title="Today's movers" keyColor="green" subtitle="Top 10 by size of change in health vs. yesterday">
          <ul className="-mt-1">
            {movers.map(({ s, d }) => (
              <li key={s.lab} className="flex items-center justify-between gap-3 border-b border-rule-soft py-3 last:border-0">
                <LabLink lab={s.lab} className="min-w-0 flex-1 text-sm font-medium" />
                <span className="flex shrink-0 items-center gap-3 text-sm">
                  <span className="tabular whitespace-nowrap text-ink-3">{fmtHealth(s.prev_health)} → <span className="text-ink">{fmtHealth(s.health)}</span></span>
                  <span className="w-12 text-right"><Delta value={d} /></span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          {(["frontier", "mid", "small"] as Tier[]).map((t) => (
            <Card key={t} title={`${TIER_LABEL[t]} tier`} subtitle="Best release per lab" action={<MoreLink href="/tiers/">Tiers</MoreLink>}>
              <ol className="-mt-1">
                {field.tiers[t].slice(0, 5).map((e) => (
                  <li key={e.lab} className="flex items-center gap-3 border-b border-rule-soft py-2.5 last:border-0">
                    <span className="serif tabular w-5 text-[18px] leading-none text-ink-3">{e.rank}</span>
                    <LabLogo lab={e.lab} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{byslug[e.release]?.name ?? e.release}</p>
                      <p className="truncate text-xs text-ink-3">{labName(e.lab)}</p>
                    </div>
                    <span className="serif tabular text-[20px] leading-none">{Math.round(e.score * 100)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
