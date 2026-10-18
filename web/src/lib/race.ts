// The race narrative behind the health replay: who led on each day, and the releases that
// reshaped the standings. Derived at build time from history.json + releases.json.
import type { History, ReleaseIndexEntry } from "./types";

export type EventKind = "lead" | "top3" | "surge";

export interface LeaderSpan {
  lab: string;
  name: string;
  start: number; // index into history.dates (inclusive)
  end: number; // inclusive
}

export interface RaceEvent {
  i: number; // index into history.dates
  date: string;
  lab: string;
  labName: string;
  release: string | null; // headline release that day; null when a lead changed hands without one
  more: number; // other releases from the same lab that day
  kinds: EventKind[]; // strongest first
  from: number | null; // health the day before
  to: number;
  rankFrom: number | null;
  rankTo: number | null;
  dethroned: string | null; // previous leader's name, for "lead" events
}

/** A release moves the race when it does at least one of these. */
export const SURGE_POINTS = 15; // health jumps by >= 15 points in one day...
const SURGE_MAX_RANK = 8; // ...and lands the lab in the top 8 (filters back-of-field noise)
const TOP_N = 3;

const KIND_WEIGHT: Record<EventKind, number> = { lead: 3, top3: 2, surge: 1 };

/** Strength used to decide which events get a text label when space is tight. */
export function eventWeight(e: RaceEvent): number {
  return Math.max(...e.kinds.map((k) => KIND_WEIGHT[k])) * 1000 + Math.abs(e.to - (e.from ?? 0));
}

function dailyLeaders(history: History): (string | null)[] {
  return history.dates.map((_, i) => {
    let best: string | null = null;
    let bestV = -Infinity;
    for (const [lab, s] of Object.entries(history.labs)) {
      const v = s.health[i];
      if (v != null && v > bestV) {
        best = lab;
        bestV = v;
      }
    }
    return best;
  });
}

export function leaderSpans(history: History, nameOf: (lab: string) => string): LeaderSpan[] {
  const leaders = dailyLeaders(history);
  const spans: LeaderSpan[] = [];
  leaders.forEach((lab, i) => {
    if (!lab) return;
    const last = spans[spans.length - 1];
    if (last && last.lab === lab && last.end === i - 1) last.end = i;
    else spans.push({ lab, name: nameOf(lab), start: i, end: i });
  });
  return spans;
}

export function raceEvents(
  history: History,
  releases: Record<string, ReleaseIndexEntry>,
  nameOf: (lab: string) => string,
): RaceEvent[] {
  const leaders = dailyLeaders(history);
  const byLabDate = new Map<string, ReleaseIndexEntry[]>();
  for (const r of Object.values(releases)) {
    const k = `${r.lab}|${r.date}`;
    byLabDate.set(k, [...(byLabDate.get(k) ?? []), r]);
  }

  const events: RaceEvent[] = [];
  for (const [lab, s] of Object.entries(history.labs)) {
    for (let i = 1; i < history.dates.length; i++) {
      const to = s.health[i];
      if (to == null) continue;
      const from = s.health[i - 1];
      const rankTo = s.rank[i];
      const rankFrom = s.rank[i - 1];
      const tookLead = leaders[i] === lab && leaders[i - 1] !== lab;
      const rels = byLabDate.get(`${lab}|${history.dates[i]}`) ?? [];
      // Without a release, only a change of leader is worth marking (a rival faded or aged out).
      if (!rels.length && !tookLead) continue;

      const kinds: EventKind[] = [];
      if (tookLead) kinds.push("lead");
      if (rels.length && rankTo != null && rankTo <= TOP_N && (rankFrom == null || rankFrom > TOP_N) && !tookLead) kinds.push("top3");
      if (rels.length && to - (from ?? 0) >= SURGE_POINTS && rankTo != null && rankTo <= SURGE_MAX_RANK) kinds.push("surge");
      if (!kinds.length) continue;

      // Headline the flagship: material releases first, then the most intelligent.
      const head = [...rels].sort((a, b) => +b.material - +a.material || b.intelligence - a.intelligence || b.competitiveness - a.competitiveness)[0];
      events.push({
        i,
        date: history.dates[i],
        lab,
        labName: nameOf(lab),
        release: head?.name ?? null,
        more: Math.max(0, rels.length - 1),
        kinds,
        from,
        to,
        rankFrom,
        rankTo,
        dethroned: tookLead && leaders[i - 1] ? nameOf(leaders[i - 1]!) : null,
      });
    }
  }
  return events.sort((a, b) => a.i - b.i || eventWeight(b) - eventWeight(a));
}
