import type { Metadata } from "next";
import { Suspense } from "react";

import { ReleaseExplorer } from "@/components/ReleaseExplorer";
import { PageHeader } from "@/components/ui";
import { history, labNames, meta, rankedLabs, releases } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { releaseHistory } from "@/lib/release-history";

export const metadata: Metadata = { title: "Releases" };

export default function ReleasesPage() {
  const records = releaseHistory(releases, history, labNames(), rankedLabs(), meta.snapshot_date);

  return (
    <div className="rise">
      <PageHeader eyebrow={`Lab Index · As of ${fmtDate(meta.snapshot_date)}`} title="Release history">
        Explore every recorded release, and compare how each lab&apos;s health changed on launch day.
      </PageHeader>
      <Suspense fallback={<p className="py-8 text-sm text-ink-2">Loading release history…</p>}>
        <ReleaseExplorer records={records} replayStart={history.dates[0]} />
      </Suspense>
    </div>
  );
}
