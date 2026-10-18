import type { Metadata } from "next";
import Link from "next/link";

import { FrontierMap } from "@/components/charts/FrontierMap";
import { Card, InfoNote, PageHeader } from "@/components/ui";
import { field, labNames, meta, ownership, rankedLabs } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Frontier map" };

export default function FrontierPage() {
  const ranked = rankedLabs();
  const cm = meta.cost_model;
  return (
    <div className="rise">
      <PageHeader eyebrow={`Lab Index · Frontier · ${fmtDate(field.date)}`} title="Frontier map">
        Every active model variant, with each release drawn as a curve through its reasoning-effort settings, because a release
        is a trade-off rather than a point. The stepped line is the field&apos;s Pareto frontier. Below it, the ownership strip shows
        who is cheapest at each capability level. This is the Lab Index&apos;s view, on its blended cost index; for raw cost per task
        and coding-plan pricing, see{" "}
        <Link href="/cost/" className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">Cost &amp; Plans</Link>.
      </PageHeader>
      <Card title="Frontier map" keyColor="violet" subtitle="Intelligence Index vs. cost index (log scale) · Up and left is better">
        <FrontierMap releases={field.releases} names={labNames()} choices={ranked} initial={ranked.slice(0, 3)} ownership={ownership.levels} />
        <InfoNote>
          Cost index = geometric mean of Artificial Analysis&apos;s cost to run the Intelligence Index (per task) and the blended 3:1 price
          per 1M tokens. Where cost per task isn&apos;t published it is estimated (log cost/task ≈ {cm.intercept} + {cm.log_price}·log price +{" "}
          {cm.intelligence}·intelligence + {cm.reasoning}·reasoning; n = {cm.n}). Estimated index scores are marked *.
        </InfoNote>
      </Card>
    </div>
  );
}
