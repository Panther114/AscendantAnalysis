import Link from "next/link";

import { meta } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-4 py-12 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <p className="serif text-[28px] leading-none">Ascendant Analysis</p>
          <p className="mt-3 max-w-sm text-sm text-ink-2">
            A deterministic health index for AI labs, and what their models really cost through coding-plan subscriptions.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-3">Explore</p>
          <Link className="block text-ink-2 hover:text-ink" href="/leaderboard/">Lab Index leaderboard</Link>
          <Link className="block text-ink-2 hover:text-ink" href="/trends/">Trends</Link>
          <Link className="block text-ink-2 hover:text-ink" href="/labs/">All labs</Link>
          <Link className="block text-ink-2 hover:text-ink" href="/cost/">Cost &amp; coding plans</Link>
          <Link className="block text-ink-2 hover:text-ink" href="/methodology/">Methodology</Link>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-xs uppercase tracking-[0.1em] text-ink-3">Data</p>
          <a className="block text-ink-2 hover:text-ink" href="https://artificialanalysis.ai">Source: Artificial Analysis ↗</a>
          <a className="block text-ink-2 hover:text-ink" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/leaderboard.json`}>Download index JSON</a>
          <a className="block text-ink-2 hover:text-ink" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/cost.json`}>Download cost &amp; plans JSON</a>
          <p className="tabular pt-2 text-xs text-ink-3">
            Methodology v{meta.methodology} · {fmtDate(meta.snapshot_date)}
            <br />
            <span className="font-mono">{meta.snapshot_hash.slice(0, 16)}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
