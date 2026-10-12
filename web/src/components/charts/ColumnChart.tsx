import Link from "next/link";

import { labs } from "@/lib/data";
import { labColor } from "@/lib/palette";
import { Monogram } from "../ui";

export interface Column {
  lab: string;
  value: number;
  label?: string; // under-bar label (defaults to lab name)
  detail?: string; // tooltip line
}

/**
 * Vertical column chart in the Artificial Analysis idiom: lab-colored columns, value inside
 * the cap (or above when the column is too short), monogram + angled name underneath.
 * Pure server-rendered HTML; hover detail via CSS.
 */
export function ColumnChart({
  data,
  max,
  height = 210,
  format = (v) => v.toFixed(0),
  unit = "",
}: {
  data: Column[];
  max?: number;
  height?: number;
  format?: (v: number) => string;
  unit?: string;
}) {
  const top = max ?? Math.max(...data.map((d) => d.value)) * 1.08;
  const ticks = [0.25, 0.5, 0.75, 1].map((t) => t * top);
  return (
    // Left padding leaves room for the first column's angled label (labels run down-left).
    <div className="pl-10">
      <div className="relative" style={{ height: height + 92 }}>
        {/* gridlines */}
        <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-rule-soft" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-x-0 bottom-0 border-t border-rule" />
        </div>
        <ol className="relative flex h-full items-stretch gap-[5px]">
          {data.map((d, i) => {
            const h = Math.max(2, (d.value / top) * height);
            const inside = h >= 30;
            return (
              <li key={`${d.lab}-${d.label ?? ""}-${i}`} className="group relative flex min-w-0 flex-1 flex-col items-center">
                <div className="relative flex w-full items-end justify-center" style={{ height }}>
                  {!inside && (
                    <span className="tabular absolute text-[11px] font-medium text-ink" style={{ bottom: h + 4 }}>
                      {format(d.value)}
                    </span>
                  )}
                  <div
                    className="grow-y relative flex w-full max-w-[44px] justify-center rounded-t-[3px] transition-[filter] group-hover:brightness-110"
                    style={{ height: h, background: labColor(d.lab), animationDelay: `${i * 35}ms` }}
                  >
                    {inside && (
                      <span className="tabular mt-1.5 text-[11px] font-medium" style={{ color: `var(--lab-${d.lab}-ink, #fff)` }}>
                        {format(d.value)}
                      </span>
                    )}
                  </div>
                  {/* hover card */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max max-w-[200px] -translate-x-1/2 rounded-md border border-rule bg-raised px-2.5 py-1.5 text-xs shadow-lg group-hover:block">
                    <p className="font-medium text-ink">{labs[d.lab]?.name ?? d.lab}</p>
                    <p className="tabular text-ink-2">
                      {format(d.value)}
                      {unit}
                    </p>
                    {d.detail && <p className="text-ink-3">{d.detail}</p>}
                  </div>
                </div>
                <Link href={`/labs/${d.lab}/`} className="mt-2 flex flex-col items-center" aria-label={`${labs[d.lab]?.name ?? d.lab}: ${format(d.value)}${unit}`}>
                  <Monogram lab={d.lab} size={18} />
                  <span className="relative mt-1.5 block h-[60px] w-full">
                    <span className="absolute right-1/2 top-0 max-w-[84px] origin-top-right -rotate-45 truncate whitespace-nowrap text-[11px] leading-tight text-ink-2 group-hover:text-ink">
                      {d.label ?? labs[d.lab]?.name ?? d.lab}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
