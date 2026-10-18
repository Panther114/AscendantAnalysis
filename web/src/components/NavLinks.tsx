"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Item {
  href: string;
  label: string;
}

interface Section extends Item {
  /** Path prefixes (no trailing slash) that belong to this section. "/" matches only the home page. */
  match: string[];
  sub?: Item[];
}

// Site hierarchy: two products (the Lab Index and Cost & Plans) plus the lab directory and the
// shared methodology. Sections with sub-pages get a second row of tabs.
export const SECTIONS: Section[] = [
  { href: "/", label: "Overview", match: ["/"] },
  {
    href: "/leaderboard/",
    label: "Lab Index",
    match: ["/leaderboard", "/trends", "/tiers", "/frontier"],
    sub: [
      { href: "/leaderboard/", label: "Leaderboard" },
      { href: "/trends/", label: "Trends" },
      { href: "/tiers/", label: "Tiers" },
      { href: "/frontier/", label: "Frontier map" },
    ],
  },
  { href: "/labs/", label: "Labs", match: ["/labs"] },
  {
    href: "/cost/",
    label: "Cost & Plans",
    match: ["/cost"],
    sub: [
      { href: "/cost/#chart", label: "Intelligence vs. cost" },
      { href: "/cost/#plans", label: "Coding plans" },
      { href: "/cost/#best", label: "Best plan per model" },
      { href: "/cost/#audit", label: "Sources & audit" },
    ],
  },
  { href: "/methodology/", label: "Methodology", match: ["/methodology"] },
];

const strip = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);

export function sectionOf(path: string): Section | undefined {
  const p = strip(path);
  return SECTIONS.find((s) => s.match.some((m) => (m === "/" ? p === "/" : p === m || p.startsWith(`${m}/`))));
}

export function NavLinks() {
  const current = sectionOf(usePathname());
  return (
    <nav aria-label="Sections" className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-sunken p-1 text-[13px] [scrollbar-width:none]">
      {SECTIONS.map((s) => {
        const on = current?.href === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
              on ? "bg-raised text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Second row: the pages (or page sections) inside the current section. */
export function SubNav() {
  const path = usePathname();
  const current = sectionOf(path);
  if (!current?.sub) return null;
  const p = strip(path);
  return (
    <div className="border-t border-rule-soft">
      <nav aria-label={current.label} className="mx-auto flex h-11 w-full max-w-[1320px] items-center gap-1 overflow-x-auto px-4 text-[13px] [scrollbar-width:none] sm:px-6">
        <span className="mr-2 shrink-0 text-xs uppercase tracking-[0.1em] text-ink-3">{current.label}</span>
        {current.sub.map((i) => {
          const hrefPath = strip(i.href.split("#")[0]);
          const on = !i.href.includes("#") && p === hrefPath;
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={on ? "page" : undefined}
              className={`relative whitespace-nowrap px-2.5 py-1.5 transition-colors ${on ? "text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {i.label}
              {on && <span aria-hidden="true" className="absolute inset-x-2.5 -bottom-[7px] h-[2px] rounded-full bg-ink" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
