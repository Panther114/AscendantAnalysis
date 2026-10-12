"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Leaderboard" },
  { href: "/trends/", label: "Trends" },
  { href: "/frontier/", label: "Frontier" },
  { href: "/tiers/", label: "Tiers" },
  { href: "/methodology/", label: "Methodology" },
];

export function NavLinks() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" || path.startsWith("/labs") : path.startsWith(href.replace(/\/$/, ""));
  return (
    <nav className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-sunken p-1 text-[13px] [scrollbar-width:none]">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={active(l.href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
            active(l.href) ? "bg-raised text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
