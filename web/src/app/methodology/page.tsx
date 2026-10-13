import katex from "katex";
import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Card, LabLink, PageHeader } from "@/components/ui";
import { labName, meta, perception, sensitivity } from "@/lib/data";
import { fmtDate, fmtHealth } from "@/lib/format";

export const metadata: Metadata = { title: "Methodology" };

function TeX({ children, block = false }: { children: string; block?: boolean }) {
  const html = katex.renderToString(children, { displayMode: block, throwOnError: true, output: "html" });
  return block ? (
    <div className="my-3 overflow-x-auto py-1 text-ink" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="scroll-mt-20 border-t border-rule pt-8" id={title.toLowerCase().replace(/\W+/g, "-")}>
      <h2 className="serif mb-3 flex items-baseline gap-3 text-[30px] leading-tight">
        <span className="tabular font-sans text-xs text-ink-3">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink-2 [&_strong]:font-medium [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function MethodologyPage() {
  const c = meta.methodology_config as Record<string, Record<string, unknown>>;
  const L = c.leadership as Record<string, number | number[]>;
  const fr = c.freshness as Record<string, number>;
  const mo = c.momentum as Record<string, number>;
  return (
    <div className="rise grid gap-10 lg:grid-cols-[1fr_300px]">
      <article className="min-w-0 space-y-8">
        <PageHeader eyebrow={`Methodology v${meta.methodology}`} title="How the Health Index works">
          A lab is healthy when its models lead rivals on <em>something</em> (intelligence, cost-efficiency, value or speed), when it
          fields a competitive lineup across tiers, when its releases are getting better relative to the field, and when it ships
          recently. Every input comes from Artificial Analysis. There is no sentiment, no news and no manual scoring.
        </PageHeader>

        <Section n={1} title="Data">
          <p>
            Each day we snapshot the Artificial Analysis models API (intelligence index, prices, speeds, release dates) and the structured
            data embedded in its public leaderboard (cost to run the Intelligence Index, release grouping, open-weights flags). Snapshots are
            gzip-compressed, content-hashed and committed. This build uses snapshot{" "}
            <code className="font-mono text-[13px] text-ink">{meta.snapshot_hash.slice(0, 16)}</code> from {fmtDate(meta.snapshot_date)}.
          </p>
          <p>
            A <strong>release</strong> (e.g. Claude Opus 5.5) groups its reasoning-effort <strong>variants</strong>. A{" "}
            <strong>product line</strong> is the release name without version numbers (Claude Opus, GPT Sol, Gemini Flash-Lite). On any
            date, the <strong>field</strong> is the newest release in every product line, dropped after{" "}
            {String((c.field as Record<string, number>).shelf_life_days)} days without a successor.
          </p>
          <p>
            <strong>Cost</strong> blends what a model costs to actually use with its list price, as a geometric mean:
          </p>
          <TeX block>{String.raw`\log C = \tfrac12 \log(\text{cost per index task}) + \tfrac12 \log(\text{blended \$/1M tokens})`}</TeX>
          <p>
            When cost per task isn&apos;t published, it is estimated from a regression fitted on the {meta.cost_model.n} models that have it.
          </p>
        </Section>

        <Section n={2} title="Tiers">
          <p>
            Tiers come from Jenks natural breaks (k = 5) on log blended price across the active field. The top band is <strong>frontier</strong>,
            the next <strong>mid</strong>, the rest <strong>small</strong>. A lab&apos;s most intelligent line is promoted from mid to frontier when it lands
            within 12 points of the best model in the world. A release keeps the tier it launched into, so tiers don&apos;t flap day to day.
          </p>
        </Section>

        <Section n={3} title="Pillar A: Frontier leadership">
          <p>
            For each axis we take the lab&apos;s best position against the <strong>single best rival</strong> and squash the margin with a sigmoid,
            so 50 means dead even:
          </p>
          <TeX block>{String.raw`\text{lead} = \sigma\!\left(\frac{\text{margin}}{\tau}\right)`}</TeX>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Intelligence:</strong> best index score minus the best rival&apos;s, <TeX>{`\\tau = ${L.tau_intelligence}`}</TeX> points.</li>
            <li>
              <strong>Efficiency and value (frontier ownership):</strong> at every capability level <TeX>{"L"}</TeX> from the frontier down,
              compare the cheapest model reaching <TeX>{"L"}</TeX> with the cheapest rival model reaching it:{" "}
              <TeX>{String.raw`\sigma\big(\log(C_\text{rival}/C_\text{lab})/\tau\big)`}</TeX>, with <TeX>{`\\tau = ${L.tau_log_cost}`}</TeX>.
              Efficiency averages levels 0–12 points below the frontier; value averages 13–25. Unreached levels count 0.
            </li>
            <li><strong>Speed</strong> (half weight): fastest model within {String(L.speed_gap)} points of the frontier vs. the fastest rival&apos;s.</li>
          </ul>
          <TeX block>{String.raw`\text{FL} = 0.6\cdot\max(\text{leads}) + 0.4\cdot\text{weighted mean}(\text{leads})`}</TeX>
          <p>Leading on one axis is enough to score well; leading on several is better.</p>
        </Section>

        <Section n={4} title="Pillar B: Lineup">
          <p>
            In each tier, every lab&apos;s best release is scored by percentile among rival labs: 50% intelligence, 40% <strong>value residual</strong>{" "}
            (intelligence above what a field-wide regression on log cost predicts), 10% speed. Then:
          </p>
          <TeX block>{String.raw`\text{LS} = 0.5\cdot\max_t s_t + 0.5\cdot\tfrac13\textstyle\sum_t s_t \quad(\text{missing tier} = 0)`}</TeX>
          <p>A specialist that wins its tier scores well, and a full lineup earns a breadth bonus.</p>
        </Section>

        <Section n={5} title="Core, momentum and freshness">
          <TeX block>{String.raw`\text{Core} = 0.55\cdot\max(\text{FL},\text{LS}) + 0.45\cdot\tfrac{\text{FL}+\text{LS}}{2}`}</TeX>
          <p>
            <strong>Momentum.</strong> Every <em>material</em> release is scored in its tier on the day it launched (its at-release competitiveness).
            The trend is the recency-weighted mean change versus its predecessor in the same product line, over the last {mo.window} changes. So
            Grok 4.5 → 4.6 → 4.7 reads as a decline even though each scored higher in absolute terms.
          </p>
          <TeX block>{String.raw`m = \tfrac12\,\sigma(\text{trend}/${mo.tau_trend}) + \tfrac12\,\overline{\text{level}}, \qquad M = ${mo.floor} + ${mo.span}\,m \in [${mo.floor}, ${mo.floor + mo.span}]`}</TeX>
          <p>
            <strong>Freshness.</strong> A release is material if it sets a new lab best in its tier or lands within {fr.material_frontier_gap} points of
            that tier&apos;s leader. After a {fr.grace_days}-day grace period, freshness halves every {fr.half_life_days} days:
          </p>
          <TeX block>{String.raw`\phi = 0.5^{\max(0,\,d-${fr.grace_days})/${fr.half_life_days}}, \qquad F = ${fr.floor} + ${(1 - fr.floor).toFixed(1)}\,\phi`}</TeX>
          <TeX block>{String.raw`\boxed{\text{Health} = 100\cdot\text{Core}\cdot M\cdot F}`}</TeX>
          <p>
            Bands: Ascendant ≥ 80, Contending ≥ 65, Holding ≥ 50, Slipping ≥ 35, Fading below. Everything is relative to the field, so a lab that ships
            nothing still moves as rivals ship.
          </p>
        </Section>

        <Section n={6} title="Determinism">
          <p>
            Scoring is a pure function of (snapshot, configuration): pure-Python arithmetic, stable tie-breaks by id, 6-decimal rounding at stage
            boundaries, and no wall-clock time. CI rebuilds the export three times, twice with shuffled input order, and refuses to deploy unless the
            hashes match. History is <em>reconstructed</em> by replaying every day with only the models released by then.
          </p>
        </Section>

        <Section n={7} title="Robustness">
          <p>
            Each of 13 weights moved ±20% one at a time. The rank range below is what today&apos;s top labs saw across those 26 runs.
          </p>
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="bg-sunken text-left text-xs text-ink-3">
                  <th className="px-4 py-2 font-normal">Lab</th>
                  <th className="px-2 py-2 text-right font-normal">Rank</th>
                  <th className="px-2 py-2 text-right font-normal">Rank range</th>
                  <th className="px-4 py-2 text-right font-normal">Health range</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.labs.map((r) => (
                  <tr key={r.lab} className="border-t border-rule">
                    <td className="px-4 py-2"><LabLink lab={r.lab} /></td>
                    <td className="tabular px-2 py-2 text-right">{r.rank}</td>
                    <td className="tabular px-2 py-2 text-right text-ink-2">{r.rank_min === r.rank_max ? "stable" : `${r.rank_min}–${r.rank_max}`}</td>
                    <td className="tabular px-4 py-2 text-right text-ink-2">{fmtHealth(r.health_min)}–{fmtHealth(r.health_max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section n={8} title="Model vs. perception">
          <p>
            The owner&apos;s own read of the landscape is recorded as a reference. It is <strong>not</strong> used to tune the weights; this table only
            reports where the data agrees and where it doesn&apos;t.
          </p>
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-sunken text-left text-xs text-ink-3">
                  <th className="px-4 py-2 font-normal">Lab</th>
                  <th className="px-2 py-2 font-normal">Check</th>
                  <th className="px-2 py-2 font-normal">Expected</th>
                  <th className="px-2 py-2 font-normal">Model says</th>
                  <th className="px-4 py-2 font-normal">Agrees</th>
                </tr>
              </thead>
              <tbody>
                {perception.flatMap((row) =>
                  row.checks.map((ck, i) => (
                    <tr key={`${row.lab}-${ck.check}`} className="border-t border-rule">
                      <td className="px-4 py-2">{i === 0 ? labName(row.lab) : ""}</td>
                      <td className="px-2 py-2 text-ink-2">{ck.check}</td>
                      <td className="px-2 py-2 text-ink-2">{String(ck.expected)}</td>
                      <td className="px-2 py-2">
                        {String(ck.actual)}
                        {ck.detail && <span className="ml-1 text-xs text-ink-3">({ck.detail})</span>}
                      </td>
                      <td className={`px-4 py-2 ${ck.ok ? "text-good" : "text-bad"}`}>{ck.ok ? "✓ yes" : "✗ no"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </article>

      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <Card title="Configuration" keyColor="ink" subtitle="Every constant, as used in this build">
            <pre className="max-h-[70vh] overflow-auto font-mono text-[11px] leading-relaxed text-ink-2">
              {JSON.stringify(meta.methodology_config, null, 1)}
            </pre>
          </Card>
        </div>
      </aside>
    </div>
  );
}
