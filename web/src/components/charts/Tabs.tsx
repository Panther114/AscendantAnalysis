"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Pill tabs with a sliding indicator. */
export function Tabs({ options, value, onChange, className = "mb-4" }: { options: { key: string; label: string }[]; value: string; onChange: (key: string) => void; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-key="${value}"]`);
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length]);

  return (
    <div className={`${className} flex max-w-full overflow-x-auto [scrollbar-width:none]`}>
      <div ref={wrap} className="relative inline-flex shrink-0 rounded-full bg-sunken p-1 text-[13px]" role="tablist">
        {pill && (
          <span
            aria-hidden="true"
            className="absolute inset-y-1 rounded-full bg-raised shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-[left,width] duration-300 ease-out"
            style={{ left: pill.left, width: pill.width }}
          />
        )}
        {options.map((o) => (
          <button
            key={o.key}
            data-key={o.key}
            role="tab"
            type="button"
            aria-selected={value === o.key}
            onClick={() => onChange(o.key)}
            className={`relative z-10 whitespace-nowrap rounded-full px-3.5 py-1.5 transition-colors duration-200 ${
              value === o.key ? "text-ink" : "text-ink-2 hover:text-ink"
            } ${pill ? "" : value === o.key ? "bg-raised" : ""}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
