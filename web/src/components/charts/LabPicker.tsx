"use client";

import { labColor } from "@/lib/palette";
import { LabMark } from "../LabMark";

export interface LabOption {
  lab: string;
  name: string;
  color?: string; // overrides the lab color (e.g. pillar lines on a lab page)
  logo?: boolean;
}

/**
 * Chip picker for which labs a chart shows. Options are listed in rank order, so the
 * "Top N" preset means the current leaders. `max` caps selections (oldest dropped).
 */
export function LabPicker({
  options,
  selected,
  onChange,
  max,
  presets = true,
  label = "Labs shown",
}: {
  options: LabOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
  presets?: boolean;
  label?: string;
}) {
  const toggle = (lab: string) => {
    if (selected.includes(lab)) onChange(selected.filter((l) => l !== lab));
    else onChange(max ? [...selected, lab].slice(-max) : [...selected, lab]);
  };
  const preset = "rounded-full px-2.5 py-1 text-xs text-ink-2 transition-colors hover:bg-sunken hover:text-ink";
  return (
    <div className="mb-4">
      {presets && (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-3">
          <span className="mr-1">{label}{max ? ` (up to ${max})` : ""}:</span>
          <button type="button" className={preset} onClick={() => onChange(options.slice(0, max ? Math.min(max, 5) : 5).map((o) => o.lab))}>
            Top 5
          </button>
          {!max && (
            <button type="button" className={preset} onClick={() => onChange(options.slice(0, 10).map((o) => o.lab))}>
              Top 10
            </button>
          )}
          {!max && (
            <button type="button" className={preset} onClick={() => onChange(options.map((o) => o.lab))}>
              All {options.length}
            </button>
          )}
          <button type="button" className={preset} onClick={() => onChange([])}>
            Clear
          </button>
          <span className="tabular ml-auto text-ink-3">{selected.length} selected</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((o) => {
          const on = selected.includes(o.lab);
          const color = o.color ?? labColor(o.lab);
          return (
            <button
              key={o.lab}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.lab)}
              className={`group inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-all duration-200 ${
                on ? "border-transparent text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "border-rule text-ink-3 hover:border-ink-3 hover:text-ink-2"
              }`}
              style={on ? { background: `color-mix(in oklab, ${color} 14%, var(--raised))`, boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
            >
              {o.logo === false ? (
                <span className="ml-1.5 h-2.5 w-2.5 rounded-full" style={{ background: on ? color : "var(--axis)" }} />
              ) : (
                <span className={`transition-[filter,opacity] duration-200 ${on ? "" : "opacity-60 grayscale"}`}>
                  <LabMark lab={o.lab} name={o.name} size={18} />
                </span>
              )}
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
