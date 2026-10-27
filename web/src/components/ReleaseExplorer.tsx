"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { fmtDate, fmtSigned, TIER_LABEL } from "@/lib/format";
import type { ReleaseRecord } from "@/lib/release-history";

const PAGE_SIZE = 20;
const controlClass = "w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm text-ink";

function Pagination({ label, page, pages, setPage }: { label: string; page: number; pages: number; setPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={`${label} pages`} className="mt-5 flex items-center justify-between gap-3 border-t border-rule-soft pt-4 text-sm">
      <button type="button" aria-label={`Previous ${label.toLowerCase()} page`} disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-full border border-rule px-3 py-1.5 text-ink-2 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">← Previous</button>
      <span className="tabular text-xs text-ink-3">Page {page + 1} of {pages}</span>
      <button type="button" aria-label={`Next ${label.toLowerCase()} page`} disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded-full border border-rule px-3 py-1.5 text-ink-2 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">Next →</button>
    </nav>
  );
}

function LabName({ record }: { record: ReleaseRecord }) {
  return record.hasLabPage
    ? <Link href={`/labs/${record.lab}/`} className="hover:text-ink hover:underline hover:underline-offset-4">{record.labName}</Link>
    : <>{record.labName}</>;
}

export function ReleaseExplorer({ records, replayStart }: { records: ReleaseRecord[]; replayStart: string }) {
  const params = useSearchParams();
  const [rankingPage, setRankingPage] = useState(0);
  const [archivePage, setArchivePage] = useState(0);
  const labs = useMemo(() => [...new Map(records.map((r) => [r.lab, r.labName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [records]);
  const years = useMemo(() => [...new Set(records.map((r) => r.date.slice(0, 4)))].sort().reverse(), [records]);
  const query = params.get("q") ?? "";
  const labParam = params.get("lab") ?? "";
  const yearParam = params.get("year") ?? "";
  const tierParam = params.get("tier") ?? "";
  const materialParam = params.get("material") ?? "";
  const lab = labs.some(([slug]) => slug === labParam) ? labParam : "";
  const year = years.includes(yearParam) ? yearParam : "";
  const tier = ["frontier", "mid", "small", "untiered"].includes(tierParam) ? tierParam : "";
  const material = ["material", "non-material"].includes(materialParam) ? materialParam : "";

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return records.filter((r) =>
      (!term || `${r.name} ${r.labName} ${r.slug}`.toLowerCase().includes(term)) &&
      (!lab || r.lab === lab) && (!year || r.date.startsWith(year)) &&
      (!tier || (r.tier ?? "untiered") === tier) &&
      (!material || r.material === (material === "material")),
    );
  }, [records, query, lab, year, tier, material]);
  const ranked = useMemo(() => [...filtered].sort((a, b) => {
    if (a.healthChange == null && b.healthChange != null) return 1;
    if (a.healthChange != null && b.healthChange == null) return -1;
    return (b.healthChange ?? 0) - (a.healthChange ?? 0) || b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug);
  }), [filtered]);
  const comparable = filtered.filter((r) => r.healthChange != null).length;
  const maxChange = Math.max(1, ...filtered.map((r) => Math.abs(r.healthChange ?? 0)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const chartPage = Math.min(rankingPage, pages - 1);
  const listPage = Math.min(archivePage, pages - 1);

  function updateFilter(key: string, value: string, replace = false) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
    setRankingPage(0);
    setArchivePage(0);
  }

  function clearFilters() {
    const url = new URL(window.location.href);
    for (const key of ["q", "lab", "year", "tier", "material"]) url.searchParams.delete(key);
    window.history.pushState(null, "", url);
    setRankingPage(0);
    setArchivePage(0);
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="release-filters" className="rounded-lg border border-rule bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="release-filters" className="serif text-[24px] leading-tight">Find releases</h2>
          <p aria-live="polite" className="text-xs text-ink-3">{filtered.length} of {records.length} releases</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-[2fr_1.2fr_1fr_1fr_1fr]">
          <label className="col-span-2 space-y-1.5 text-xs text-ink-2 lg:col-span-1"><span>Search</span><input type="search" value={query} onChange={(e) => updateFilter("q", e.target.value, true)} placeholder="Release or lab" className={controlClass} /></label>
          <label className="space-y-1.5 text-xs text-ink-2"><span>Lab</span><select value={lab} onChange={(e) => updateFilter("lab", e.target.value)} className={controlClass}><option value="">All labs</option>{labs.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></label>
          <label className="space-y-1.5 text-xs text-ink-2"><span>Year</span><select value={year} onChange={(e) => updateFilter("year", e.target.value)} className={controlClass}><option value="">All years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          <label className="space-y-1.5 text-xs text-ink-2"><span>Tier</span><select value={tier} onChange={(e) => updateFilter("tier", e.target.value)} className={controlClass}><option value="">All tiers</option><option value="frontier">Frontier</option><option value="mid">Mid</option><option value="small">Small</option><option value="untiered">Untiered</option></select></label>
          <label className="space-y-1.5 text-xs text-ink-2"><span>Materiality</span><select value={material} onChange={(e) => updateFilter("material", e.target.value)} className={controlClass}><option value="">All releases</option><option value="material">Material</option><option value="non-material">Non-material</option></select></label>
        </div>
        {(query || lab || year || tier || material) && <button type="button" onClick={clearFilters} className="mt-3 text-xs text-ink-2 underline underline-offset-4 hover:text-ink">Clear filters</button>}
      </section>

      <section aria-labelledby="ranking-heading" className="rounded-lg border border-rule bg-surface p-5">
        <h2 id="ranking-heading" className="serif flex items-center gap-2.5 text-[24px] leading-tight"><span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 bg-[var(--key-green)]" />Release-day health change</h2>
        <p className="mt-1 text-xs text-ink-3">Ranked from largest gain to largest decline · {comparable} comparable of {filtered.length} matching releases</p>
        <p className="mt-3 max-w-4xl text-sm leading-relaxed text-ink-2">
          Points show the lab&apos;s health on release day minus the previous day, from the reconstructed replay. Other releases, rivals and time can also move health, so this is not a causal impact. Releases from the same lab on the same day share the change.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-3">Unavailable means the release predates the replay ({fmtDate(replayStart)}) or the lab was not ranked on both days. These releases appear after the ranked results.</p>
        {ranked.length ? (
          <>
            <div aria-hidden="true" className="mt-5 hidden grid-cols-[minmax(0,1fr)_minmax(180px,1fr)_84px] gap-4 text-[11px] uppercase tracking-[0.08em] text-ink-3 sm:grid"><span>Release · lab</span><span className="flex justify-between"><span>−{maxChange.toFixed(1)}</span><span>0</span><span>+{maxChange.toFixed(1)}</span></span><span className="text-right">Points</span></div>
            <ol start={chartPage * PAGE_SIZE + 1} className="mt-2 divide-y divide-rule-soft border-t border-rule-soft">
              {ranked.slice(chartPage * PAGE_SIZE, (chartPage + 1) * PAGE_SIZE).map((r, i) => (
                <li key={r.slug} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,1fr)_84px] sm:items-center sm:gap-4">
                  <div className="flex min-w-0 items-start gap-3"><span className="serif tabular w-7 shrink-0 text-right text-[18px] leading-tight text-ink-3">{r.healthChange == null ? "—" : chartPage * PAGE_SIZE + i + 1}</span><div className="min-w-0"><p className="break-words text-sm font-medium">{r.name}</p><p className="mt-0.5 text-xs text-ink-3"><LabName record={r} /> · {fmtDate(r.date)}{r.sameDayCount > 1 && <> · shared day</>}</p></div></div>
                  <div aria-hidden="true" className="relative ml-10 h-3 rounded-full bg-sunken sm:ml-0"><span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink-3" />{r.healthChange != null && r.healthChange !== 0 && <span className={`absolute top-0 h-full ${r.healthChange > 0 ? "rounded-r-full bg-good" : "rounded-l-full bg-bad"}`} style={{ width: `${Math.abs(r.healthChange) / maxChange * 50}%`, ...(r.healthChange > 0 ? { left: "50%" } : { right: "50%" }) }} />}</div>
                  <p className={`tabular ml-10 text-sm sm:ml-0 sm:text-right ${r.healthChange == null ? "text-ink-3" : "text-ink"}`}>{r.healthChange == null ? "Unavailable" : `${fmtSigned(r.healthChange)} pts`}</p>
                </li>
              ))}
            </ol>
            <Pagination label="Ranking" page={chartPage} pages={pages} setPage={setRankingPage} />
          </>
        ) : <p className="mt-5 rounded-md bg-sunken p-4 text-sm text-ink-2">No releases match these filters. Try another search or clear the filters.</p>}
      </section>

      <section aria-labelledby="archive-heading" className="rounded-lg border border-rule bg-surface p-5">
        <h2 id="archive-heading" className="serif flex items-center gap-2.5 text-[24px] leading-tight"><span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 bg-[var(--key-blue)]" />All releases</h2>
        <p className="mt-1 text-xs text-ink-3">Newest first · the same search and filters apply</p>
        {filtered.length ? (
          <>
            <ul className="mt-4 divide-y divide-rule-soft border-t border-rule-soft">
              {filtered.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE).map((r) => (
                <li key={r.slug} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0"><p className="break-words text-sm font-medium">{r.name}</p><p className="mt-1 text-xs text-ink-3"><LabName record={r} /> · {fmtDate(r.date)} · {r.tier ? `${TIER_LABEL[r.tier]} tier` : "Untiered"} · {r.material ? "Material" : "Non-material"}</p></div>
                  <div className="text-right text-xs text-ink-3"><p>Intelligence <span className="tabular text-ink-2">{r.intelligence.toFixed(1)}</span></p><p className="mt-1">Health change <span className="tabular text-ink-2">{r.healthChange == null ? "—" : `${fmtSigned(r.healthChange)} pts`}</span>{r.healthChange != null && r.sameDayCount > 1 && " · shared day"}</p></div>
                </li>
              ))}
            </ul>
            <Pagination label="Archive" page={listPage} pages={pages} setPage={setArchivePage} />
          </>
        ) : <p className="mt-5 text-sm text-ink-2">No releases to show.</p>}
      </section>
    </div>
  );
}
