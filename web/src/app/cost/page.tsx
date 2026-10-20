import type { Metadata } from "next";

import { CostChart } from "@/components/charts/CostChart";
import { Card, InfoNote, LabLogo, PageHeader } from "@/components/ui";
import { cost, labName, labNames, leaderboard } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { fmtX, multiplierRange, plansFor, usdTask } from "@/lib/plans";
import type { CodingPlan, CostModel } from "@/lib/types";

export const metadata: Metadata = { title: "Cost & Plans" };

const CONF_LABEL: Record<string, string> = {
  official: "Official",
  measured: "Measured",
  derived: "Derived",
  estimate: "Estimate",
  unknown: "Unknown",
};

function price(p: CodingPlan) {
  return `$${p.price_usd % 1 ? p.price_usd.toFixed(2) : p.price_usd.toFixed(0)}`;
}

export default function CostPage() {
  // Labs ordered by their best model, so the picker reads like the chart top-down.
  const bestByLab = new Map<string, number>();
  for (const m of cost.models) bestByLab.set(m.lab, Math.max(bestByLab.get(m.lab) ?? 0, m.intelligence));
  const labs = [...bestByLab.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);

  // One row per release: its highest-scoring variant.
  const heads = new Map<string, CostModel>();
  for (const m of cost.models) {
    const h = heads.get(m.release);
    if (!h || m.intelligence > h.intelligence) heads.set(m.release, m);
  }
  const rows = [...heads.values()].sort((a, b) => b.intelligence - a.intelligence);

  const checkBy = new Map((cost.check?.plans ?? []).map((p) => [p.id, p]));
  const regions: { key: "global" | "china"; title: string }[] = [
    { key: "global", title: "Global plans" },
    { key: "china", title: "China plans" },
  ];
  // Strongest subsidy first; plans whose subsidy can't be quantified go last.
  const peak = (p: CodingPlan) => Math.max(-1, ...p.models.map((m) => m.multiplier ?? -1), p.default_multiplier ?? -1);
  const eligible = cost.plans.filter((p) => p.eligible).sort((a, b) => peak(b) - peak(a) || a.price_usd - b.price_usd);
  const excluded = cost.plans.filter((p) => !p.eligible);
  const flagged = (cost.check?.plans ?? []).filter((p) => p.flags.length);

  return (
    <div className="rise">
      <PageHeader eyebrow={`Cost & Plans · Models as of ${fmtDate(cost.date)} · Plans reviewed ${fmtDate(cost.reviewed)}`} title="Intelligence vs. cost per task">
        Artificial Analysis&apos;s Intelligence Index against what one index task costs to run. By default, at API list prices,
        exactly as Artificial Analysis measures it. Switch on coding plans and every model slides to its cost through the best
        subscription that serves it, so the frontier shows what the work really costs for someone on a plan.
      </PageHeader>

      <section id="chart" className="scroll-mt-32">
        <Card title="Intelligence vs. cost per task" keyColor="orange" subtitle={`${cost.models.length} current model variants with a measured cost per task · Up and left is better`}>
          <CostChart models={cost.models} plans={cost.plans} names={labNames()} labs={labs} initialLabs={labs} labPages={leaderboard.map((l) => l.lab)} />
          <InfoNote>
            Cost per task is Artificial Analysis&apos;s cost to run its Intelligence Index divided by the number of tasks, at each
            model&apos;s API list price. Through a plan it is divided by that plan&apos;s subsidy for the model: the API-equivalent value
            of the plan&apos;s monthly allowance over its monthly price. Only plans costing ${cost.min_price_usd}/month or more count;
            cheaper plans can carry large nominal subsidies but are not usable at scale. Subsidies are estimates; see the sources
            and audit below.
          </InfoNote>
        </Card>
      </section>

      <section id="plans" className="mt-4 scroll-mt-32">
        <Card title="Coding plans" keyColor="violet" subtitle={`${eligible.length} eligible plans · open a plan for its full lineup, limits, method and sources`}>
          {regions.map(({ key, title }) => {
            const list = eligible.filter((p) => p.region === key);
            if (!list.length) return null;
            return (
              <div key={key} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-xs uppercase tracking-[0.1em] text-ink-3">{title} · {list.length}</h3>
                <div className="hidden grid-cols-[minmax(0,1.6fr)_80px_110px_minmax(0,1.4fr)_100px] gap-3 border-b border-rule px-3 pb-2 text-[11px] uppercase tracking-[0.08em] text-ink-3 md:grid">
                  <span>Plan</span>
                  <span className="text-right">Price/mo</span>
                  <span className="text-right">Subsidy</span>
                  <span>Lineup</span>
                  <span className="text-right">Verified</span>
                </div>
                <ul>
                  {list.map((p) => (
                    <PlanRow key={p.id} p={p} flags={checkBy.get(p.id)?.flags ?? []} />
                  ))}
                </ul>
              </div>
            );
          })}
          {excluded.length > 0 && (
            <div className="mt-6 rounded-md border border-dashed border-rule p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.1em] text-ink-3">Not counted · {excluded.length}</p>
              <ul className="space-y-1 text-sm text-ink-2">
                {excluded.map((p) => (
                  <li key={p.id}>
                    <span className="text-ink">{p.product} {p.plan}</span> ({p.provider}, {price(p)}/mo, nominal {multiplierRange(p)}):{" "}
                    {p.exclude_reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </section>

      <section id="best" className="mt-4 scroll-mt-32">
        <Card pad={false} title="Best plan per model" keyColor="green" subtitle="Each release at its highest-scoring effort · runner-up shows how much the choice of plan matters">
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  <th className="px-5 py-2 font-normal">Model</th>
                  <th className="px-3 py-2 text-right font-normal">Index</th>
                  <th className="px-3 py-2 text-right font-normal">API $/task</th>
                  <th className="px-3 py-2 font-normal">Best plan</th>
                  <th className="px-3 py-2 text-right font-normal">Subsidy</th>
                  <th className="px-3 py-2 text-right font-normal">Plan $/task</th>
                  <th className="px-5 py-2 font-normal">Runner-up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const picks = plansFor(m, cost.plans);
                  const [b, r] = picks;
                  return (
                    <tr key={m.release} className="border-b border-rule-soft hover:bg-wash">
                      <td className="px-5 py-2">
                        <span className="flex items-center gap-2.5">
                          <LabLogo lab={m.lab} size={18} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{m.name}</span>
                            <span className="block truncate text-xs text-ink-3">{labName(m.lab)}</span>
                          </span>
                        </span>
                      </td>
                      <td className="tabular px-3 py-2 text-right">{m.intelligence.toFixed(1)}</td>
                      <td className="tabular px-3 py-2 text-right text-ink-2">{usdTask(m.cost_per_task)}</td>
                      <td className="px-3 py-2">{b ? <>{b.plan.product} {b.plan.plan} <span className="text-xs text-ink-3">{price(b.plan)}</span></> : <span className="text-ink-3">none: API only</span>}</td>
                      <td className="tabular px-3 py-2 text-right">{b ? fmtX(b.multiplier) : "—"}</td>
                      <td className="tabular px-3 py-2 text-right font-medium">{b ? usdTask(b.cost) : usdTask(m.cost_per_task)}</td>
                      <td className="px-5 py-2 text-xs text-ink-3">{r ? <>{r.plan.product} {r.plan.plan} · {fmtX(r.multiplier)}</> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section id="audit" className="mt-4 scroll-mt-32">
        <Card title="Sources & audit" keyColor="blue" subtitle="How the subsidies are set, and how they are kept honest">
          <div className="grid gap-6 text-sm text-ink-2 lg:grid-cols-2">
            <div className="space-y-3">
              <p>
                <span className="font-medium text-ink">Hand-reviewed, never auto-updated.</span> Plan prices, lineups and subsidies live in{" "}
                <code className="font-mono text-xs">config/coding_plans.yaml</code>. Each plan cites its sources with dates and says how its
                multiplier was derived: from the provider&apos;s own published allowance (official), from metered usage (measured), from
                arithmetic on published quotas and API prices (derived), or from third-party estimates (estimate).
              </p>
              <p>
                <span className="font-medium text-ink">Daily audit.</span> A scheduled job re-reads Devforth&apos;s crowd-measured limits
                (metered with the <code className="font-mono text-xs">letmecode</code> CLI) and flags any plan whose implied subsidy drifts by
                more than {Math.round((cost.check?.drift_tolerance ?? 0.25) * 100)}% from the pinned value, probes every cited URL, and flags
                plans not re-verified for {cost.check?.stale_after_days ?? 90} days. Flags surface here and in CI; a person then decides.
              </p>
              {cost.definition && <p className="text-xs text-ink-3">{cost.definition}</p>}
            </div>
            <div>
              {cost.check ? (
                <>
                  <p className="text-xs uppercase tracking-[0.1em] text-ink-3">Last audit · {fmtDate(cost.check.checked)}</p>
                  <ul className="mt-2 space-y-1.5">
                    <li>
                      Devforth:{" "}
                      {cost.check.devforth.error ? <span className="text-bad">unavailable ({cost.check.devforth.error})</span> : <span className="text-ink">{cost.check.devforth.plans} plans read</span>}
                    </li>
                    <li>
                      Sources: <span className="text-ink">{cost.check.sources.total - cost.check.sources.unreachable}/{cost.check.sources.total}</span> reachable
                    </li>
                    <li>
                      Plans flagged: <span className={flagged.length ? "text-bad" : "text-good"}>{flagged.length}</span>
                    </li>
                  </ul>
                  {flagged.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs">
                      {flagged.map((f) => (
                        <li key={f.id}>
                          <span className="font-mono text-ink">{f.id}</span>: {f.flags.join("; ")}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-ink-3">No audit has been run yet.</p>
              )}
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function PlanRow({ p, flags }: { p: CodingPlan; flags: string[] }) {
  const inChart = p.models.filter((m) => m.in_snapshot);
  return (
    <li className="border-b border-rule-soft last:border-0">
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-3 px-3 py-3 hover:bg-wash md:grid-cols-[minmax(0,1.6fr)_80px_110px_minmax(0,1.4fr)_100px]">
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium">
              <span aria-hidden="true" className="text-ink-3 transition-transform group-open:rotate-90">›</span>
              <span className="truncate">{p.product} {p.plan}</span>
              {flags.length > 0 && <span className="rounded-full border border-bad px-1.5 text-[10px] text-bad" title={flags.join("; ")}>review</span>}
            </span>
            <span className="block truncate pl-4 text-xs text-ink-3">{p.provider}{p.price_local ? ` · ${p.price_local}` : ""}</span>
          </span>
          <span className="tabular text-right md:order-none">{price(p)}</span>
          <span className="tabular hidden text-right font-medium md:block">{multiplierRange(p)}</span>
          <span className="hidden min-w-0 truncate text-xs text-ink-2 md:block">
            {p.models.map((m) => m.name).join(", ") || "—"}
          </span>
          <span className="tabular hidden text-right text-xs text-ink-3 md:block">{fmtDate(p.verified)}</span>
        </summary>
        <div className="grid gap-5 px-3 pb-5 pl-7 text-sm lg:grid-cols-[1fr_1.2fr]">
          <dl className="space-y-2 text-ink-2">
            <div className="md:hidden"><dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Subsidy</dt><dd className="text-ink">{multiplierRange(p)}</dd></div>
            {p.quota && <div><dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Limits</dt><dd>{p.quota}</dd></div>}
            {p.billing && <div><dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Billing</dt><dd>{p.billing}</dd></div>}
            {p.tools.length > 0 && <div><dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Works in</dt><dd>{p.tools.join(", ")}</dd></div>}
            {p.default_basis && <div><dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">How the subsidy is derived</dt><dd>{p.default_basis}</dd></div>}
            {p.caveats && <div><dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Caveats</dt><dd>{p.caveats}</dd></div>}
            {flags.length > 0 && <div><dt className="text-[11px] uppercase tracking-[0.08em] text-bad">Audit flags</dt><dd>{flags.join("; ")}</dd></div>}
            <div>
              <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Sources</dt>
              <dd>
                <ul className="mt-1 space-y-1">
                  {p.sources.map((s) => (
                    <li key={s.url} className="text-xs">
                      <a href={s.url} className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink" rel="noopener noreferrer" target="_blank">{s.title}</a>
                      <span className="text-ink-3"> · {s.date}{s.used_for ? ` · ${s.used_for}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-rule text-left uppercase tracking-[0.08em] text-ink-3">
                  <th className="py-1.5 pr-3 font-normal">Model</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Subsidy</th>
                  <th className="py-1.5 font-normal">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {p.models.map((m) => (
                  <tr key={m.name} className="border-b border-rule-soft align-top">
                    <td className="py-1.5 pr-3">
                      <span className="text-ink">{m.name}</span>
                      {!m.in_snapshot && <span className="block text-ink-3">{m.release ? "no current cost/task on AA" : "not tracked by AA"}</span>}
                      {m.basis && m.basis !== p.default_basis && <span className="block text-ink-3">{m.basis}</span>}
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right font-medium">{m.multiplier ? fmtX(m.multiplier) : "—"}</td>
                    <td className="py-1.5 text-ink-2">{CONF_LABEL[m.confidence ?? ""] ?? m.confidence ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-ink-3">{inChart.length} of {p.models.length} lineup models appear in the chart.</p>
          </div>
        </div>
      </details>
    </li>
  );
}
