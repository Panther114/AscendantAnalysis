import Link from "next/link";

import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

export function Nav() {
  return (
    <header className="sticky top-0 z-30 bg-page/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-full bg-ink py-1.5 pl-2 pr-3.5 text-page transition-opacity hover:opacity-85"
          aria-label="Ascendant Analysis home"
        >
          <Mark />
          <span className="serif hidden text-[17px] leading-none sm:inline">Ascendant Analysis</span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-center">
          <NavLinks />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href="https://artificialanalysis.ai"
            className="hidden rounded-full border border-rule px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink lg:inline"
          >
            Data: Artificial Analysis ↗
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** Brand icon (same artwork as app/icon.svg): three rising bars on a dark tile. */
function Mark() {
  return (
    <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="mark-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d1d26" />
          <stop offset="1" stopColor="#0b0b10" />
        </linearGradient>
        <linearGradient id="mark-peak" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f2733b" />
          <stop offset="1" stopColor="#f2cf1d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#mark-bg)" />
      <rect x="9" y="34" width="12" height="20" rx="3" fill="#2f6bf6" />
      <rect x="26" y="23" width="12" height="31" rx="3" fill="#7351f5" />
      <rect x="43" y="9" width="12" height="45" rx="3" fill="url(#mark-peak)" />
    </svg>
  );
}
