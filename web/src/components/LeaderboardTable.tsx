import { history } from "@/lib/data";
import { AXIS_LABEL, fmtHealth, fmtMult } from "@/lib/format";
import { labColor } from "@/lib/palette";
import type { LabScore } from "@/lib/types";
import { BandBadge, Delta, LabLink, Sparkline } from "./ui";

function strongest(s: LabScore) {
  const scored = s.leads.filter((l) => l.score != null);
  if (!scored.length) return null;
  return scored.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a));
}

function Pillar({ value }: { value: number }) {
  const v = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="tabular w-6 text-right text-ink">{v}</span>
      <span className="relative h-1 w-14 overflow-hidden rounded-full bg-sunken">
        <span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${v}%` }} />
      </span>
    </div>
  );
}

function Row({ s }: { s: LabScore }) {
  const top = strongest(s);
  const spark = history.labs[s.lab]?.health.slice(-92) ?? [];
  const rankDelta = s.prev_rank == null ? null : s.prev_rank - s.rank;
  return (
    <tr className="group border-t border-rule-soft transition-colors hover:bg-wash">
      <td className="py-3 pl-5 pr-1">
        <span className="serif tabular text-[22px] leading-none text-ink">{s.rank}</span>
      </td>
      <td className="w-9 px-1 text-[11px]">{rankDelta === 0 ? <span className="text-ink-3">–</span> : <Delta value={rankDelta} digits={0} />}</td>
      <td className="max-w-[230px] px-2 py-3 font-medium">
        <LabLink lab={s.lab} size={22} />
      </td>
      <td className="w-[240px] px-2 py-3">
        <div className="flex items-center gap-3">
          <span className="serif tabular w-12 text-right text-[24px] leading-none">{fmtHealth(s.health)}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-sunken">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s.health}%`, background: labColor(s.lab) }} />
          </span>
        </div>
      </td>
      <td className="px-2 py-3 text-xs">
        <Delta value={s.prev_health == null ? null : s.health - s.prev_health} />
      </td>
      <td className="hidden px-2 py-3 md:table-cell">
        <BandBadge band={s.band} />
      </td>
      <td className="hidden px-2 py-3 text-xs lg:table-cell"><Pillar value={s.leadership} /></td>
      <td className="hidden px-2 py-3 text-xs lg:table-cell"><Pillar value={s.lineup} /></td>
      <td className="tabular hidden px-2 py-3 text-xs text-ink-2 lg:table-cell">{fmtMult(s.momentum)}</td>
      <td className="tabular hidden px-2 py-3 text-xs text-ink-2 lg:table-cell">{fmtMult(s.freshness_multiplier)}</td>
      <td className="hidden px-2 py-3 text-xs xl:table-cell">
        {top && (top.score ?? 0) >= 0.5 ? (
          <span className="whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-page">Leads {AXIS_LABEL[top.axis].toLowerCase()}</span>
        ) : top ? (
          <span className="whitespace-nowrap text-ink-3">Best at {AXIS_LABEL[top.axis].toLowerCase()}</span>
        ) : null}
      </td>
      <td className="hidden py-3 pl-2 pr-5 sm:table-cell">
        <Sparkline values={spark} color={labColor(s.lab)} />
      </td>
    </tr>
  );
}

const TH = "px-2 py-2.5 text-left text-[11px] font-normal uppercase tracking-[0.08em] text-ink-3";

export function LeaderboardTable({ scores, collapseAfter = 15 }: { scores: LabScore[]; collapseAfter?: number }) {
  const head = (
    <thead className="bg-sunken/60">
      <tr>
        <th className={`${TH} pl-5`}>#</th>
        <th className={TH}><span className="sr-only">Rank change</span></th>
        <th className={TH}>Lab</th>
        <th className={TH}>Health index</th>
        <th className={TH}>1w</th>
        <th className={`${TH} hidden md:table-cell`}>Band</th>
        <th className={`${TH} hidden lg:table-cell`}>Leadership</th>
        <th className={`${TH} hidden lg:table-cell`}>Lineup</th>
        <th className={`${TH} hidden lg:table-cell`}>Momentum</th>
        <th className={`${TH} hidden lg:table-cell`}>Freshness</th>
        <th className={`${TH} hidden xl:table-cell`}>Edge</th>
        <th className={`${TH} hidden pr-5 sm:table-cell`}>13 weeks</th>
      </tr>
    </thead>
  );
  const top = scores.slice(0, collapseAfter);
  const rest = scores.slice(collapseAfter);
  return (
    // `relative` makes this the containing block for sr-only (absolute) labels, so they're
    // clipped by the scroller instead of widening the page on phones.
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        {head}
        <tbody>
          {top.map((s) => (
            <Row key={s.lab} s={s} />
          ))}
        </tbody>
      </table>
      {rest.length > 0 && (
        <details className="group/more border-t border-rule">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-2 py-3 text-[13px] text-ink-2 hover:text-ink">
            <span className="group-open/more:hidden">Show all {scores.length} labs ↓</span>
            <span className="hidden group-open/more:inline">Show fewer ↑</span>
          </summary>
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <tbody>
              {rest.map((s) => (
                <Row key={s.lab} s={s} />
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
