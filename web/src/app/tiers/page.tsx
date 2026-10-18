import type { Metadata } from "next";
import Link from "next/link";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { Card, InfoNote, LabLogo, PageHeader, type KeyColor } from "@/components/ui";
import { field, labName } from "@/lib/data";
import { fmtPct, fmtUsd, TIER_LABEL } from "@/lib/format";
import type { Tier } from "@/lib/types";

export const metadata: Metadata = { title: "Tiers" };

const TIERS: { t: Tier; key: KeyColor; blurb: string }[] = [
  { t: "frontier", key: "violet", blurb: "Flagships: blended price at or above the frontier cut-off" },
  { t: "mid", key: "yellow", blurb: "Workhorses: blended price between the mid and frontier cut-offs" },
  { t: "small", key: "orange", blurb: "Cheap and fast: blended price below the mid cut-off" },
];

export default function TiersPage() {
  const byslug = Object.fromEntries(field.releases.map((r) => [r.slug, r]));
  const [midMin, frontierMin] = field.price_breaks;
  return (
    <div className="rise">
      <PageHeader eyebrow="Lab Index · Tiers" title="Head-to-head, tier by tier">
        Each lab&apos;s best active release in each tier, scored 50% intelligence, 40% value (intelligence above what its cost
        predicts) and 10% speed, each as a soft win rate against rival labs (close to the percentile, but graded by the size of the gap). Tiers come from fixed cut-offs on a release&apos;s own blended price ({fmtUsd(midMin)} and
        {fmtUsd(frontierMin)} per 1M tokens), so they never depend on other models.
      </PageHeader>

      <div className="space-y-4">
        {TIERS.map(({ t, key, blurb }) => {
          const entries = field.tiers[t];
          return (
            <Card key={t} title={`${TIER_LABEL[t]} tier`} keyColor={key} subtitle={`${entries.length} ranked labs · tier score, 0–100 · Higher is better · ${blurb}`}>
              <ColumnChart
                data={entries.map((e) => ({ lab: e.lab, value: e.score * 100, label: byslug[e.release]?.name ?? e.release, detail: labName(e.lab) }))}
                max={100}
              />
              <ol className="mt-4 grid gap-x-6 border-t border-rule-soft pt-2 sm:grid-cols-2 xl:grid-cols-3">
                {entries.map((e) => {
                  const r = byslug[e.release];
                  return (
                    <li key={e.lab} className="flex items-center gap-3 border-b border-rule-soft py-2.5 transition-colors hover:bg-wash">
                      <span className="serif tabular w-6 text-right text-[20px] leading-none text-ink-3">{e.rank}</span>
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
          );
        })}
      </div>
      <InfoNote>
        I, V and S are the release&apos;s soft win rate on intelligence, value and speed. Scores are computed against every lab with a model in
        the tier, including unranked labs whose models have no published price; the lists show ranked labs only.
      </InfoNote>
    </div>
  );
}
