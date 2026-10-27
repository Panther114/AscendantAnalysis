import Link from "next/link";

import { HealthChart } from "@/components/charts/HealthChart";
import { CountUp } from "@/components/CountUp";
import { BandBadge, Card, CtaLink, LabLink, LabLogo, PageHeader } from "@/components/ui";
import { cost, history, labName, labs, leaderboard, meta, rankedLabs, releases } from "@/lib/data";
import { recentReleases } from "@/lib/explain";
import { fmtDate, fmtHealth, TIER_LABEL } from "@/lib/format";
import { bestPlan, fmtX, usdTask } from "@/lib/plans";
import { leaderSpans, raceEvents } from "@/lib/race";
import type { CostModel } from "@/lib/types";

/** Cheapest model reaching `level`, by API price and through the best coding plan. */
function cheapestAt(level: number) {
  const reach = cost.models.filter((m) => m.intelligence >= level);
  const api = reach.reduce<CostModel | null>((a, m) => (!a || m.cost_per_task < a.cost_per_task ? m : a), null);
  let plan: { m: CostModel; c: number; name: string; x: number } | null = null;
  for (const m of reach) {
    const p = bestPlan(m, cost.plans);
    if (p && (!plan || p.cost < plan.c)) plan = { m, c: p.cost, name: `${p.plan.product} ${p.plan.plan}`, x: p.multiplier };
  }
  return { api, plan };
}

export default function Home() {
  const leader = leaderboard[0];
  const latest = recentReleases(meta.snapshot_date, 21, false);
  const ranked = rankedLabs();
  const start = Math.max(0, history.dates.findIndex((d) => d >= "2026-01-01"));
  const top = Math.max(...cost.models.map((m) => m.intelligence));
  const level = Math.floor(top - 5);
  const cheap = cheapestAt(level);
  const eligible = cost.plans.filter((p) => p.eligible);

  return (
    <div className="rise">
      <PageHeader
        eyebrow={`As of ${fmtDate(meta.snapshot_date)} · Data: Artificial Analysis`}
        title={
          <>
            Who leads in AI,
            <br />
            and what it costs
          </>
        }
      >
        Two lenses on the same models. The <span className="text-ink">Lab Index</span> scores how strong, competitive and current
        each lab&apos;s lineup is against its rivals. <span className="text-ink">Cost &amp; Plans</span> re-prices every model through
        the best coding-plan subscription that serves it, because almost nobody codes at API list prices.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Lab Index" keyColor="violet" subtitle="Deterministic health index, 0–100, rescored daily" action={<CtaLink href="/leaderboard/">Full leaderboard</CtaLink>}>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-ink-3">Ascendant today</span>
            <LabLink lab={leader.lab} />
            <CountUp value={leader.health} className="serif text-[26px] leading-none text-ink" />
            <BandBadge band={leader.band} />
          </div>
          <ol>
            {leaderboard.slice(0, 6).map((s) => (
              <li key={s.lab} className="flex items-center gap-3 border-b border-rule-soft py-2.5 last:border-0">
                <span className="serif tabular w-5 text-[18px] leading-none text-ink-3">{s.rank}</span>
                <LabLogo lab={s.lab} />
                <Link href={`/labs/${s.lab}/`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline hover:underline-offset-4">
                  {labs[s.lab]?.name ?? s.lab}
                </Link>
                <span className="hidden sm:inline"><BandBadge band={s.band} /></span>
                <span className="serif tabular w-12 text-right text-[20px] leading-none">{fmtHealth(s.health)}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Cost & Plans" keyColor="orange" subtitle="Intelligence vs. cost per task, at API prices or through coding plans" action={<CtaLink href="/cost/">Open the chart</CtaLink>}>
          <p className="text-sm text-ink-2">
            Cheapest way to a model scoring <span className="tabular text-ink">{level}+</span> on the Intelligence Index, per task:
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-rule p-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">At API prices</p>
              <p className="serif tabular mt-1 text-[34px] leading-none">{cheap.api ? usdTask(cheap.api.cost_per_task) : "—"}</p>
              <p className="mt-1 truncate text-xs text-ink-2">{cheap.api?.name}</p>
            </div>
            <div className="rounded-md border border-ink p-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Through a coding plan</p>
              <p className="serif tabular mt-1 text-[34px] leading-none">{cheap.plan ? usdTask(cheap.plan.c) : "—"}</p>
              <p className="mt-1 truncate text-xs text-ink-2">
                {cheap.plan ? <>{cheap.plan.m.name} · {cheap.plan.name} ({fmtX(cheap.plan.x)})</> : "No plan"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-ink-3">
            <span className="tabular text-ink">{cost.models.length}</span> model variants ·{" "}
            <span className="tabular text-ink">{eligible.length}</span> coding plans from ${cost.min_price_usd}/month ·{" "}
            plan data reviewed {fmtDate(cost.reviewed)}
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card
          title="Health over time"
          keyColor="blue"
          subtitle="Daily replay · each day rescored using only the models released by then"
          action={<CtaLink href="/trends/">See the full chart</CtaLink>}
        >
          <HealthChart
            dates={history.dates.slice(start)}
            series={ranked.map((lab) => ({ lab, name: labs[lab].name, values: history.labs[lab].health.slice(start) }))}
            initial={ranked.slice(0, 5)}
          />
          <Link
            href="/trends/"
            className="group mt-3 flex items-center justify-between gap-3 rounded-md border border-rule bg-sunken px-4 py-3 text-sm text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            <span>
              See who held #1 on every day ({leaderSpans(history, labName).length - 1} lead changes) and the{" "}
              <span className="font-medium text-ink">{raceEvents(history, releases, labName).length} releases that moved the race</span>
            </span>
            <span aria-hidden="true" className="shrink-0 transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </Card>
        <Card title="Latest releases" keyColor="green" subtitle="All recorded releases in the last 3 weeks">
          <p className="mb-2 text-xs text-ink-3">Materiality margin: index points above or below the easier cutoff at release. A tie meets the frontier cutoff, but must beat a lab&apos;s previous best. First releases in a tier and releases inactive on launch have no margin.</p>
          <ul className="-mt-1 divide-y divide-rule-soft">
            {latest.map((r) => (
              <li key={r.slug}>
                <div className="group flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-tag">{fmtDate(r.date)}</p>
                    <p className="mt-0.5 text-[15px] font-medium">{ranked.includes(r.lab) ? <Link href={`/labs/${r.lab}/`} className="hover:underline hover:underline-offset-4">{r.name}</Link> : r.name}</p>
                    <p className="text-[13px] text-ink-3">
                      {labName(r.lab)} · {r.tier ? `${TIER_LABEL[r.tier]} tier` : "untiered"} · index {r.intelligence.toFixed(1)}
                    </p>
                    <p className="mt-1 text-xs text-ink-2">{r.material ? "Material" : "Non-material"} · margin {r.materiality_margin == null ? "—" : `${r.materiality_margin > 0 ? "+" : ""}${r.materiality_margin.toFixed(1)} pts`}</p>
                  </div>
                </div>
              </li>
            ))}
            {!latest.length && <li className="py-3 text-sm text-ink-3">No recorded releases in the last 3 weeks.</li>}
          </ul>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="serif mb-4 text-[30px] leading-tight">Explore</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/leaderboard/", k: "Lab Index", t: "Leaderboard", d: "Every ranked lab by Health, as a table or re-sorted by any component." },
            { href: "/trends/", k: "Lab Index", t: "Trends", d: "Daily replay since January, lead changes and the releases that moved the race." },
            { href: "/tiers/", k: "Lab Index", t: "Tiers", d: "Head-to-head in the frontier, mid and small price tiers." },
            { href: "/frontier/", k: "Lab Index", t: "Frontier map", d: "Each release as a curve through its reasoning efforts, and who owns each capability level." },
            { href: "/cost/", k: "Cost & Plans", t: "Intelligence vs. cost", d: "Artificial Analysis's chart, re-priced through the best coding plan per model." },
            { href: "/cost/#plans", k: "Cost & Plans", t: "Coding plans", d: "Every plan's price, subsidy, model lineup, limits and sources." },
          ].map((x) => (
            <Link key={x.href} href={x.href} className="group rounded-lg border border-rule bg-surface p-4 transition-colors hover:border-ink">
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">{x.k}</p>
              <p className="mt-1 flex items-center justify-between text-[17px] font-medium">
                {x.t}
                <span aria-hidden="true" className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink">→</span>
              </p>
              <p className="mt-1 text-sm text-ink-2">{x.d}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
