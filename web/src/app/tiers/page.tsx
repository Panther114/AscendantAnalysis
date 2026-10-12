import type { Metadata } from "next";
import Link from "next/link";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { Card, InfoNote, LabLogo, PageHeader, type KeyColor } from "@/components/ui";
import { field, labName } from "@/lib/data";
import { fmtPct, fmtUsd, TIER_LABEL } from "@/lib/format";
import type { Tier } from "@/lib/types";

export const metadata: Metadata = { title: "Tiers" };

const TIERS: { t: Tier; key: KeyColor; blurb: string }[] = [
  { t: "frontier", key: "violet", blurb: "Flagships: top price band, plus each lab's best line when within 12 points of the frontier" },
  { t: "mid", key: "yellow", blurb: "Workhorses: second price band" },
  { t: "small", key: "orange", blurb: "Cheap and fast: everything below the mid band" },
];

export default function TiersPage() {
  const byslug = Object.fromEntries(field.releases.map((r) => [r.slug, r]));
  const [midMin, frontierMin] = field.price_breaks;
  return (
    <div className="rise">
      <PageHeader eyebrow="Tiers" title="Head-to-head, tier by tier">
        Each lab&apos;s best active release in each tier, scored 50% intelligence, 40% value (intelligence above what its cost
        predicts) and 10% speed, each as a percentile among rival labs. Tiers come from natural breaks in blended price (now ≈
        {fmtUsd(midMin)} and ≈{fmtUsd(frontierMin)} per 1M tokens) and are fixed at launch.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {TIERS.map(({ t, key, blurb }) => (
          <Card key={t} title={`${TIER_LABEL[t]} tier`} keyColor={key} subtitle={`Tier score · Higher is better · ${blurb}`}>
            <ColumnChart
              data={field.tiers[t].slice(0, 10).map((e) => ({ lab: e.lab, value: e.score * 100, label: byslug[e.release]?.name ?? e.release, detail: labName(e.lab) }))}
              max={100}
            />
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {TIERS.map(({ t }) => (
          <Card key={t} pad={false} title={`${TIER_LABEL[t]}: full ranking`}>
            <ol className="mt-3">
              {field.tiers[t].map((e) => {
                const r = byslug[e.release];
                return (
                  <li key={e.lab} className="flex items-center gap-3 border-t border-rule-soft px-5 py-3">
                    <span className="serif tabular w-6 text-[20px] leading-none text-ink-3">{e.rank}</span>
                    <LabLogo lab={e.lab} size={22} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r?.name ?? e.release}</p>
                      <p className="tabular truncate text-xs text-ink-3">
                        <Link href={`/labs/${e.lab}/`} className="hover:text-ink">{labName(e.lab)}</Link>
                        {" · "}I {fmtPct(e.pct_intelligence)} · V {fmtPct(e.pct_value)} · S {fmtPct(e.pct_speed)}
                      </p>
                    </div>
                    <span className="serif tabular text-[22px] leading-none">{Math.round(e.score * 100)}</span>
                  </li>
                );
              })}
            </ol>
          </Card>
        ))}
      </div>
      <InfoNote>I, V and S are the release&apos;s percentile on intelligence, value and speed among labs in that tier. A tier with a single entrant scores 100.</InfoNote>
    </div>
  );
}
