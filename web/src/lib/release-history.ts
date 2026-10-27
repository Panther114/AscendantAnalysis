import type { History, ReleaseIndexEntry, Tier } from "./types";

export interface ReleaseRecord {
  slug: string;
  name: string;
  lab: string;
  labName: string;
  hasLabPage: boolean;
  date: string;
  tier: Tier | null;
  intelligence: number;
  material: boolean;
  healthChange: number | null;
  sameDayCount: number;
}

/** Join each release to the lab's day-over-day replay, without implying causation. */
export function releaseHistory(
  releases: Record<string, ReleaseIndexEntry>,
  history: History,
  names: Record<string, string>,
  rankedLabs: string[],
  snapshotDate: string,
): ReleaseRecord[] {
  const dates = new Map(history.dates.map((date, index) => [date, index]));
  const ranked = new Set(rankedLabs);
  const entries = Object.entries(releases).filter(([, release]) => release.date <= snapshotDate);
  const counts = new Map<string, number>();
  for (const [, release] of entries) {
    const key = `${release.lab}|${release.date}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return entries.map(([slug, release]) => {
    const index = dates.get(release.date);
    const values = history.labs[release.lab]?.health;
    const current = index == null ? null : values?.[index];
    const previous = index == null || index === 0 ? null : values?.[index - 1];
    const consecutive = index != null && index > 0
      && Date.parse(`${release.date}T00:00:00Z`) - Date.parse(`${history.dates[index - 1]}T00:00:00Z`) === 864e5;
    const difference = consecutive && current != null && previous != null
      ? Math.round((current - previous) * 10) / 10 : null;
    return {
      slug,
      name: release.name,
      lab: release.lab,
      labName: names[release.lab] ?? release.lab,
      hasLabPage: ranked.has(release.lab),
      date: release.date,
      tier: release.tier,
      intelligence: release.intelligence,
      material: release.material,
      healthChange: difference === 0 ? 0 : difference,
      sameDayCount: counts.get(`${release.lab}|${release.date}`) ?? 1,
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
}
