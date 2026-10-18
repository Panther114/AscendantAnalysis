import type { Metadata } from "next";
import Link from "next/link";

import { BandBadge, LabLogo, PageHeader, Sparkline } from "@/components/ui";
import { field, history, labs, leaderboard, meta } from "@/lib/data";
import { fmtDate, fmtHealth } from "@/lib/format";
import { labColor } from "@/lib/palette";

export const metadata: Metadata = { title: "Labs" };

export default function LabsPage() {
  const n = history.dates.length;
  return (
    <div className="rise">
      <PageHeader eyebrow={`Labs · As of ${fmtDate(meta.snapshot_date)}`} title="Every ranked lab">
        One card per lab, in Health order. Open a lab for its score decomposition, leads, tier slots, release history and why it
        moved today.
      </PageHeader>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {leaderboard.map((s) => {
          const top = field.releases.filter((r) => r.lab === s.lab).sort((a, b) => b.intelligence - a.intelligence)[0];
          return (
            <li key={s.lab}>
              <Link
                href={`/labs/${s.lab}/`}
                className="group flex h-full flex-col rounded-lg border border-rule bg-surface p-4 transition-colors hover:border-ink"
              >
                <div className="flex items-center gap-3">
                  <span className="serif tabular w-7 text-[20px] leading-none text-ink-3">{s.rank}</span>
                  <LabLogo lab={s.lab} size={28} />
                  <p className="min-w-0 flex-1 truncate font-medium group-hover:underline group-hover:underline-offset-4">{labs[s.lab]?.name ?? s.lab}</p>
                  <span className="serif tabular text-[26px] leading-none">{fmtHealth(s.health)}</span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0 text-xs text-ink-3">
                    <BandBadge band={s.band} />
                    <p className="mt-2 truncate">{top ? <>Best: <span className="text-ink-2">{top.name}</span> · {top.intelligence.toFixed(1)}</> : "No active release"}</p>
                  </div>
                  <Sparkline values={history.labs[s.lab]?.health.slice(Math.max(0, n - 92)) ?? []} color={labColor(s.lab)} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
