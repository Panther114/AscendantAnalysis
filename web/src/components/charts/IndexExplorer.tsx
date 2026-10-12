"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { labColor } from "@/lib/palette";
import { LabMark } from "../LabMark";
import { Tabs } from "./Tabs";

export interface ExplorerRow {
  lab: string;
  name: string;
  band: string;
  values: Record<string, number | null>;
}

export interface ExplorerMetric {
  key: string;
  label: string;
  subtitle: string;
  domain: [number, number];
  digits: number;
  prefix?: string;
}

const PLOT_H = 230;
const LABEL_H = 118; // logo + angled name (long names need ~85px of drop)
const TOP_PAD = 12; // room for the top axis label inside the scroller

/**
 * Every ranked lab as a column. Switching metric re-sorts with a FLIP-style slide (columns
 * are absolutely positioned and transition their x), while bar heights morph in place.
 */
export function IndexExplorer({ rows, metrics, initial }: { rows: ExplorerRow[]; metrics: ExplorerMetric[]; initial?: string }) {
  const [key, setKey] = useState(initial ?? metrics[0].key);
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const m = metrics.find((x) => x.key === key) ?? metrics[0];
  const [lo, hi] = m.domain;
  const order = [...rows].sort((a, b) => (b.values[key] ?? -Infinity) - (a.values[key] ?? -Infinity) || a.name.localeCompare(b.name));
  const pos = new Map(order.map((r, i) => [r.lab, i]));
  const n = rows.length;
  const fmt = (v: number | null) => (v == null ? "—" : `${m.prefix ?? ""}${v.toFixed(m.digits)}`);
  const ticks = [0.25, 0.5, 0.75, 1];

  return (
    <div>
      <Tabs options={metrics.map((x) => ({ key: x.key, label: x.label }))} value={key} onChange={setKey} />
      <p className="-mt-2 mb-4 text-xs text-ink-3">{m.subtitle}</p>
      <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
        <div className="relative pl-14 pr-2" style={{ minWidth: n * 34 + 64, height: PLOT_H + LABEL_H + TOP_PAD, paddingTop: TOP_PAD }}>
          {/* gridlines + y labels */}
          <div className="pointer-events-none absolute inset-x-0 pl-14 pr-2" style={{ top: TOP_PAD, height: PLOT_H }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-14 border-t border-dashed border-rule-soft" style={{ bottom: `${t * 100}%` }}>
                <span className="tabular absolute -left-10 -top-2 w-8 text-right text-[10px] text-ink-3">{fmt(lo + (hi - lo) * t).replace(m.prefix ?? "", "")}</span>
              </div>
            ))}
            <div className="absolute inset-x-14 bottom-0 border-t border-rule" />
          </div>
          <ol className="absolute bottom-0 left-14 right-2" style={{ top: TOP_PAD }}>
            {rows.map((r) => {
              const v = r.values[key];
              const frac = v == null ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
              const h = mounted ? Math.max(3, frac * PLOT_H) : 0;
              const i = pos.get(r.lab) ?? 0;
              const inside = h >= 26;
              const active = hover === r.lab;
              return (
                <li
                  key={r.lab}
                  className="absolute top-0 flex flex-col items-center transition-[left] duration-700 [transition-timing-function:cubic-bezier(0.2,0.75,0.2,1)]"
                  style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
                  onPointerEnter={() => setHover(r.lab)}
                  onPointerLeave={() => setHover(null)}
                >
                  <Link href={`/labs/${r.lab}/`} className="group flex w-full flex-col items-center" aria-label={`${r.name}: ${fmt(v)}`}>
                    <div className="relative flex w-full items-end justify-center" style={{ height: PLOT_H }}>
                      <span
                        className="tabular absolute text-[11px] font-medium text-ink transition-[bottom,opacity] duration-700"
                        style={{ bottom: h + 4, opacity: inside ? 0 : 1 }}
                      >
                        {fmt(v)}
                      </span>
                      {active && (
                        <div
                          className="pointer-events-none absolute left-1/2 z-20 w-max -translate-x-1/2 rounded-md border border-rule bg-raised px-2.5 py-1.5 text-xs shadow-lg"
                          style={{ bottom: Math.min(h + 22, PLOT_H - 64) }}
                        >
                          <p className="font-medium text-ink">{r.name}</p>
                          <p className="tabular text-ink-2">
                            {m.label}: <span className="text-ink">{fmt(v)}</span> · #{i + 1} of {n}
                          </p>
                          <p className="text-ink-3">{r.band}</p>
                        </div>
                      )}
                      <div
                        className="relative flex w-[78%] max-w-[40px] justify-center rounded-t-[4px] transition-[height,filter,transform] duration-700 [transition-timing-function:cubic-bezier(0.2,0.75,0.2,1)]"
                        style={{
                          height: h,
                          background: labColor(r.lab),
                          filter: hover && !active ? "saturate(0.55) opacity(0.6)" : "none",
                          transform: active ? "translateY(-3px)" : "none",
                          transitionDelay: mounted ? `0ms` : `${i * 25}ms`,
                        }}
                      >
                        <span
                          className="tabular mt-1.5 text-[11px] font-medium transition-opacity duration-300"
                          style={{ color: `var(--lab-${r.lab}-ink, #fff)`, opacity: inside ? 1 : 0 }}
                        >
                          {fmt(v)}
                        </span>
                      </div>
                    </div>
                    <span className={`mt-2 transition-transform duration-200 ${active ? "scale-110" : ""}`}>
                      <LabMark lab={r.lab} name={r.name} size={20} />
                    </span>
                    <span className="relative mt-1.5 block h-[88px] w-full">
                      <span className={`absolute right-1/2 top-0 max-w-[124px] origin-top-right -rotate-45 truncate whitespace-nowrap text-[11px] leading-tight ${active ? "text-ink" : "text-ink-2"}`}>
                        {r.name}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
