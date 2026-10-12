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

/** Ascent mark: three rising steps and a peak. */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2" y="12" width="4" height="6" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="8" y="8" width="4" height="10" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="14" y="3" width="4" height="15" rx="1" fill="currentColor" />
    </svg>
  );
}
