import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { HealthChart } from "@/components/charts/HealthChart";
import { ReleaseTimeline, type TimelinePoint } from "@/components/charts/ReleaseTimeline";
import { BandBadge, Card, Delta, InfoNote, Meter, LabLogo } from "@/components/ui";
import { field, history, labs, leaderboard, meta, releases, variantName } from "@/lib/data";
import { describeLead, recentReleases, weeklyDrivers } from "@/lib/explain";
import { AXIS_LABEL, fmtDate, fmtHealth, fmtMult, fmtPct, fmtSigned, TIER_LABEL } from "@/lib/format";
import { labColor } from "@/lib/palette";

export function generateStaticParams() {
  return leaderboard.map((s) => ({ lab: s.lab }));
}

export async function generateMetadata(props: PageProps<"/labs/[lab]">): Promise<Metadata> {
  const { lab } = await props.params;
  return { title: labs[lab]?.name ?? lab };
}

function HealthRing({ value, color }: { value: number; color: string }) {
  const r = 68;
  const c = 2 * Math.PI * r;
  const arc = 0.75; // 270° gauge
  const filled = (Math.max(0, Math.min(100, value)) / 100) * arc * c;
  return (
    <svg width="168" height="150" viewBox="0 0 168 150" aria-hidden="true">
      <g transform="rotate(135 84 84)">
        <circle cx="84" cy="84" r={r} fill="none" stroke="var(--sunken)" strokeWidth="10" strokeDasharray={`${(arc * c).toFixed(2)} ${c.toFixed(2)}`} strokeLinecap="round" />
        <circle cx="84" cy="84" r={r} fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${filled.toFixed(2)} ${c.toFixed(2)}`} strokeLinecap="round" />
      </g>
    </svg>
  );
}

export default async function LabPage(props: PageProps<"/labs/[lab]">) {
  const { lab } = await props.params;
  const s = leaderboard.find((x) => x.lab === lab);
  if (!s) notFound();
  const m = labs[lab];
  const color = labColor(lab);
  const cfg = meta.methodology_config as Record<string, Record<string, number>>;
  const coreMw = cfg.core.max_weight;
  const drivers = weeklyDrivers(s);
  const recent = recentReleases(meta.snapshot_date);
  const h = history.labs[lab];
  const start = history.dates[0];
  const timeline: TimelinePoint[] = s.history
    .filter((p) => p.date >= start && releases[p.release])
    .map((p) => ({
      slug: p.release,
      name: releases[p.release].name,
      date: p.date,
      line: releases[p.release].line,
      tier: p.tier,
      competitiveness: p.competitiveness,
      material: p.material,
      intelligence: releases[p.release].intelligence,
    }));
  const active = field.releases.filter((r) => r.lab === lab).sort((a, b) => b.intelligence - a.intelligence);
  const steps = [
    { label: "Leadership", value: s.leadership * 100, note: "best-of + breadth over 4 axes" },
    { label: "Lineup", value: s.lineup * 100, note: "best tier + breadth over 3 tiers" },
    { label: "Core", value: s.core * 100, note: `${coreMw}·max + ${(1 - coreMw).toFixed(2)}·mean`, strong: true },
    { label: "× Momentum", value: s.core * s.momentum * 100, note: fmtMult(s.momentum) },
    { label: "× Freshness", value: Math.min(100, s.core * s.momentum * s.freshness_multiplier * 100), note: fmtMult(s.freshness_multiplier) },
  ];

  return (
    <div className="rise">
      <div className="relative -mx-4 mb-8 px-4 pt-8 sm:-mx-6 sm:px-6 sm:pt-12">
        <div aria-hidden="true" className="paper-grid pointer-events-none absolute inset-0 -z-10" />
        <Link href="/" className="text-xs text-ink-3 hover:text-ink">← Leaderboard</Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <LabLogo lab={lab} size={44} />
              <h1 className="serif text-[52px] leading-none sm:text-[72px]">{m.name}</h1>
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
              <span>
                Rank <span className="serif tabular text-[20px] text-ink">#{s.rank}</span> of {leaderboard.length}
                {s.prev_rank != null && s.prev_rank !== s.rank && <span className="text-ink-3"> (was #{s.prev_rank})</span>}
              </span>
              <BandBadge band={s.band} size="md" />
              <span>{active.length} active release{active.length === 1 ? "" : "s"}</span>
            </p>
          </div>
          <div className="relative grid place-items-center">
            <HealthRing value={s.health} color={color} />
            <div className="absolute inset-0 grid place-items-center pb-3 text-center">
              <div>
                <p className="serif tabular text-[52px] leading-none">{fmtHealth(s.health)}</p>
                <p className="mt-1 text-xs text-ink-3">
                  Health · <Delta value={s.prev_health == null ? null : s.health - s.prev_health} /> 1w
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Card title="Score decomposition" keyColor="violet" subtitle="Health = 100 · Core · Momentum · Freshness, clamped to 0–100">
          <div className="space-y-3.5">
            {steps.map((st) => (
              <div key={st.label} className="grid grid-cols-[96px_1fr_52px] items-center gap-3">
                <span className={`text-[13px] ${st.strong ? "font-medium text-ink" : "text-ink-2"}`}>{st.label}</span>
                <div>
                  <Meter value={st.value} max={100} color={st.strong ? color : "var(--ink)"} height={st.strong ? 10 : 5} label={st.label} />
                  <p className="mt-1 text-[11px] text-ink-3">{st.note}</p>
                </div>
                <span className="serif tabular text-right text-[22px] leading-none">{st.value.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-rule-soft pt-4 text-[13px]">
            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Momentum trend</p>
              <p className="serif tabular mt-1 text-[24px] leading-none">{fmtSigned(s.momentum_slope * 100, 1)}</p>
              <p className="mt-1 text-xs text-ink-2">points per release, vs. predecessor in the same product line</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Last material release</p>
              <p className="mt-1 font-medium">{s.last_material ? releases[s.last_material]?.name ?? s.last_material : "—"}</p>
              <p className="mt-0.5 text-xs text-ink-2">
                {s.days_since_material == null ? "none" : `${s.days_since_material} days ago`} · freshness {fmtPct(s.freshness)}
              </p>
            </div>
          </div>
        </Card>

        <Card title="Why it moved" keyColor="green" subtitle="Week-over-week change split across the three multiplicative factors">
          {drivers.length ? (
            <ul className="space-y-2.5">
              {drivers.map((d) => (
                <li key={d.label} className="flex items-center justify-between text-sm">
                  <span className="text-ink-2">{d.label}</span>
                  <Delta value={d.delta} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">No change from last week.</p>
          )}
          <p className="mb-2 mt-6 text-[11px] uppercase tracking-[0.08em] text-ink-3">Material releases across the field, last 7 days</p>
          {recent.length ? (
            <ul className="divide-y divide-rule-soft text-sm">
              {recent.map((r) => (
                <li key={r.slug} className="flex items-center gap-2.5 py-2">
                  <LabLogo lab={r.lab} size={18} />
                  <span className={r.lab === lab ? "font-medium text-ink" : "text-ink-2"}>{r.name}</span>
                  <span className="tabular ml-auto text-xs text-ink-3">{fmtDate(r.date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">None. Movement came from the lab&apos;s own clock (freshness) or momentum.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Frontier leadership" keyColor="yellow" subtitle="Lead over the single best rival per axis, sigmoid-mapped · 50 = dead even">
          <div className="space-y-4">
            {s.leads.map((l) => (
              <div key={l.axis}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">
                    {AXIS_LABEL[l.axis]}
                    {l.weight !== 1 && <span className="ml-1 text-xs font-normal text-ink-3">(weight {l.weight})</span>}
                  </span>
                  <span className="serif tabular text-[22px] leading-none">{l.score == null ? "—" : (l.score * 100).toFixed(0)}</span>
                </div>
                <div className="mt-1.5"><Meter value={l.score ?? 0} color={color} height={5} label={AXIS_LABEL[l.axis]} /></div>
                <p className="mt-1.5 text-xs text-ink-2">{describeLead(l)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Lineup by tier" keyColor="orange" subtitle="Best active release per tier vs. every rival lab's best in that tier">
          <div className="space-y-4">
            {(["frontier", "mid", "small"] as const).map((t) => {
              const slot = s.tiers.find((x) => x.tier === t);
              return (
                <div key={t}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">{TIER_LABEL[t]}</span>
                    <span className="serif tabular text-[22px] leading-none">{slot ? (slot.score * 100).toFixed(0) : "—"}</span>
                  </div>
                  {slot ? (
                    <>
                      <div className="mt-1.5"><Meter value={slot.score} color={color} height={5} label={`${t} tier score`} /></div>
                      <p className="mt-1.5 text-xs text-ink-2">
                        {variantName(slot.variant)} · rank <span className="tabular">{slot.rank}</span> of {slot.of} · intelligence {fmtPct(slot.pct_intelligence)}, value {fmtPct(slot.pct_value)}, speed {fmtPct(slot.pct_speed)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1.5 text-xs text-ink-3">No active release in this tier (counts 0 toward breadth).</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="mt-4" title="Release track record" keyColor="blue" subtitle="Competitiveness in its tier on launch day · Momentum is built from the changes between successors">
        <ReleaseTimeline points={timeline} color={color} start={start} end={meta.snapshot_date} />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="Health history" keyColor="ink" subtitle="Weekly replay of the index and its pillars">
          <HealthChart
            dates={history.dates}
            series={[
              { lab, name: "Health", values: h.health },
              { lab: `${lab}-fl`, name: "Leadership ×100", color: "var(--ink-2)", logo: false, values: h.leadership.map((v) => (v == null ? null : v * 100)) },
              { lab: `${lab}-ls`, name: "Lineup ×100", color: "var(--ink-3)", logo: false, values: h.lineup.map((v) => (v == null ? null : v * 100)) },
            ]}
            initial={[lab]}
            presets={false}
            height={300}
          />
          <InfoNote>Leadership and lineup are off by default; toggle them to see which pillar drove a move.</InfoNote>
        </Card>
        <Card title="Active releases" keyColor="violet" subtitle="Best Intelligence Index per release · Higher is better">
          <ColumnChart data={active.slice(0, 10).map((r) => ({ lab, value: r.intelligence, label: r.name, detail: `${r.tier ? TIER_LABEL[r.tier] : "Untiered"} · ${fmtDate(r.date)}` }))} />
        </Card>
      </div>
    </div>
  );
}
