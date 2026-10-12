import Link from "next/link";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { HealthChart } from "@/components/charts/HealthChart";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { BandBadge, Card, Delta, LabLink, Monogram, MoreLink, PageHeader } from "@/components/ui";
import { featuredLabs, field, history, labName, labs, leaderboard, meta } from "@/lib/data";
import { recentReleases } from "@/lib/explain";
import { fmtDate, fmtHealth, TIER_LABEL } from "@/lib/format";
import type { Tier } from "@/lib/types";

export default function Home() {
  const leader = leaderboard[0];
  const top12 = leaderboard.slice(0, 12);
  const byLeadership = [...leaderboard].sort((a, b) => b.leadership - a.leadership).slice(0, 12);
  const byLineup = [...leaderboard].sort((a, b) => b.lineup - a.lineup).slice(0, 12);
  const movers = leaderboard
    .filter((s) => s.prev_health != null)
    .map((s) => ({ s, d: s.health - (s.prev_health as number) }))
    .filter((m) => Math.abs(m.d) >= 0.05)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 6);
  const latest = recentReleases(meta.snapshot_date, 21).slice(0, 4);
  const featured = featuredLabs();
  const start = Math.max(0, history.dates.findIndex((d) => d >= "2026-01-01"));
  const byslug = Object.fromEntries(field.releases.map((r) => [r.slug, r]));

  return (
    <div className="rise">
      <PageHeader
        eyebrow={`AI Lab Health Index · Week of ${fmtDate(meta.snapshot_date)}`}
        title={
          <>
            The health of
            <br />
            every AI lab
          </>
        }
        aside={
          <div className="flex flex-col justify-end">
            <p className="mb-1 text-xs uppercase tracking-[0.12em] text-ink-3">Latest material releases</p>
            <ul className="divide-y divide-rule">
              {latest.map((r) => (
                <li key={r.slug}>
                  <Link href={`/labs/${r.lab}/`} className="group flex items-start justify-between gap-4 py-3.5">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-tag">New · {fmtDate(r.date)}</p>
                      <p className="mt-0.5 truncate text-[15px] font-medium">{r.name}</p>
                      <p className="text-[13px] text-ink-3">
                        {labName(r.lab)} · {r.tier ? `${TIER_LABEL[r.tier]} tier` : "untiered"} · index {r.intelligence.toFixed(1)}
                      </p>
                    </div>
                    <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sunken text-ink-2 transition-colors group-hover:bg-ink group-hover:text-page">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        }
      >
        How strong, competitive and current each lab&apos;s model lineup is against its rivals. It is fully deterministic,
        computed from{" "}
        <a href="https://artificialanalysis.ai" className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
          Artificial Analysis
        </a>{" "}
        benchmarks, prices and speeds, and relative to the field: a lab that stands still loses ground.
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <span className="flex items-center gap-2.5">
            <span className="text-ink-3">Ascendant this week</span>
            <LabLink lab={leader.lab} />
            <span className="serif tabular text-[22px] leading-none text-ink">{fmtHealth(leader.health)}</span>
          </span>
          <span className="text-ink-3">
            <span className="tabular text-ink">{meta.counts.labs_ranked}</span> labs ·{" "}
            <span className="tabular text-ink">{meta.counts.releases}</span> releases ·{" "}
            <span className="tabular text-ink">{meta.counts.variants}</span> model variants
          </span>
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Health Index" keyColor="violet" subtitle="Ascendant Health Index (0–100) · Higher is better">
          <ColumnChart data={top12.map((s) => ({ lab: s.lab, value: s.health, detail: s.band }))} max={100} format={(v) => v.toFixed(0)} />
        </Card>
        <Card title="Frontier Leadership" keyColor="yellow" subtitle="Lead over the best rival on intelligence, cost or speed · Higher is better">
          <ColumnChart data={byLeadership.map((s) => ({ lab: s.lab, value: s.leadership * 100 }))} max={100} />
        </Card>
        <Card title="Lineup Strength" keyColor="orange" subtitle="Best tier + breadth across frontier, mid and small · Higher is better">
          <ColumnChart data={byLineup.map((s) => ({ lab: s.lab, value: s.lineup * 100 }))} max={100} />
        </Card>
      </div>

      <Card
        className="mt-4"
        pad={false}
        title="Leaderboard"
        keyColor="ink"
        subtitle="Health = Core (leadership ⊕ lineup) × momentum × freshness · Select a lab for its full breakdown"
        action={<MoreLink href="/methodology/">Methodology</MoreLink>}
      >
        <div className="mt-4">
          <LeaderboardTable scores={leaderboard} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card
          title="Health over time"
          keyColor="blue"
          subtitle="Weekly replay · each Monday rescored using only the models released by then"
          action={<MoreLink href="/trends/">All trends</MoreLink>}
        >
          <HealthChart
            dates={history.dates.slice(start)}
            series={featured.map((lab) => ({ lab, name: labs[lab].name, values: history.labs[lab].health.slice(start) }))}
            initial={featured.slice(0, 5)}
          />
        </Card>
        <Card title="This week's movers" keyColor="green" subtitle="Change in health vs. last Monday">
          <ul className="-mt-1">
            {movers.map(({ s, d }) => (
              <li key={s.lab} className="flex items-center justify-between gap-3 border-b border-rule-soft py-3 last:border-0">
                <LabLink lab={s.lab} className="text-sm font-medium" />
                <span className="flex items-center gap-3 text-sm">
                  <span className="tabular text-ink-3">{fmtHealth(s.prev_health)} → <span className="text-ink">{fmtHealth(s.health)}</span></span>
                  <span className="w-12 text-right"><Delta value={d} /></span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {(["frontier", "mid", "small"] as Tier[]).map((t) => (
          <Card key={t} title={`${TIER_LABEL[t]} tier`} subtitle="Best release per lab, scored against rivals" action={<MoreLink href="/tiers/">Tiers</MoreLink>}>
            <ol className="-mt-1">
              {field.tiers[t].slice(0, 5).map((e) => (
                <li key={e.lab} className="flex items-center gap-3 border-b border-rule-soft py-2.5 last:border-0">
                  <span className="serif tabular w-5 text-[18px] leading-none text-ink-3">{e.rank}</span>
                  <Monogram lab={e.lab} />
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

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-rule bg-sunken/50 px-5 py-4 text-sm text-ink-2">
        <span className="serif text-[20px] text-ink">How to read a band</span>
        {["Ascendant", "Contending", "Holding", "Slipping", "Fading"].map((b) => (
          <BandBadge key={b} band={b} />
        ))}
        <span className="text-xs text-ink-3">≥80 · ≥65 · ≥50 · ≥35 · below</span>
      </div>
    </div>
  );
}
