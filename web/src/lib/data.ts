// Server-only data access. JSON is statically imported, so every page is pre-rendered at
// build time from the pipeline export and no data is fetched at runtime.
import fieldJson from "@data/field.json";
import historyJson from "@data/history.json";
import labsJson from "@data/labs.json";
import leaderboardJson from "@data/leaderboard.json";
import metaJson from "@data/meta.json";
import ownershipJson from "@data/ownership.json";
import perceptionJson from "@data/perception.json";
import releasesJson from "@data/releases.json";
import sensitivityJson from "@data/sensitivity.json";

import type {
  FieldOut,
  History,
  LabMeta,
  LabScore,
  Meta,
  OwnershipLevel,
  PerceptionRow,
  ReleaseIndexEntry,
  Sensitivity,
} from "./types";

export const meta = metaJson as unknown as Meta;
export const labs = labsJson as unknown as Record<string, LabMeta>;
export const leaderboard = leaderboardJson as unknown as LabScore[];
export const history = historyJson as unknown as History;
export const field = fieldJson as unknown as FieldOut;
export const ownership = ownershipJson as unknown as {
  frontier: number;
  levels: OwnershipLevel[];
};
export const perception = perceptionJson as unknown as PerceptionRow[];
export const releases = releasesJson as unknown as Record<string, ReleaseIndexEntry>;
export const sensitivity = sensitivityJson as unknown as Sensitivity;

export function labName(slug: string | null | undefined): string {
  if (!slug) return "—";
  return labs[slug]?.name ?? slug;
}

export function releaseName(slug: string): string {
  return releases[slug]?.name ?? field.releases.find((r) => r.slug === slug)?.name ?? slug;
}

const variantNames = new Map(field.releases.flatMap((r) => r.variants.map((v) => [v.slug, v.name] as const)));

export function variantName(slug: string | null | undefined): string {
  if (!slug) return "—";
  return variantNames.get(slug) ?? slug;
}

export function scoreFor(lab: string): LabScore | undefined {
  return leaderboard.find((s) => s.lab === lab);
}

/** Labs shown in charts by default: the palette labs that are ranked, in palette order. */
export function featuredLabs(): string[] {
  return Object.entries(labs)
    .filter(([slug, m]) => m.slot !== null && leaderboard.some((s) => s.lab === slug))
    .sort((a, b) => (a[1].slot ?? 99) - (b[1].slot ?? 99))
    .map(([slug]) => slug);
}


export function labNames(): Record<string, string> {
  return Object.fromEntries(Object.entries(labs).map(([k, v]) => [k, v.name]));
}
