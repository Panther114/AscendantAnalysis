import Link from "next/link";
import type { ReactNode } from "react";

import { labs } from "@/lib/data";
import { fmtSigned } from "@/lib/format";
import { bandLevel } from "@/lib/palette";
import { LabMark } from "./LabMark";

export type KeyColor = "violet" | "yellow" | "orange" | "green" | "blue" | "ink";

export function Card({
  title,
  keyColor,
  subtitle,
  action,
  children,
  className = "",
  pad = true,
}: {
  title?: ReactNode;
  keyColor?: KeyColor;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-rule bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && (
              <h2 className="serif flex items-center gap-2.5 text-[24px] leading-tight">
                {keyColor && <span aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0" style={{ background: `var(--key-${keyColor})` }} />}
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-1 text-xs leading-snug text-ink-3">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, children, aside }: { eyebrow?: string; title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="relative -mx-4 mb-8 px-4 pt-10 sm:-mx-6 sm:px-6 sm:pt-14">
      <div aria-hidden="true" className="paper-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="max-w-3xl">
          {eyebrow && <p className="mb-4 text-xs uppercase tracking-[0.12em] text-ink-3">{eyebrow}</p>}
          <h1 className="serif text-[48px] leading-[0.98] sm:text-[72px]">{title}</h1>
          {children && <div className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">{children}</div>}
        </div>
        {aside}
      </div>
    </div>
  );
}

/** Lab logo tile (server-side convenience wrapper around LabMark). */
export function LabLogo({ lab, size = 20 }: { lab: string; size?: number }) {
  return <LabMark lab={lab} name={labs[lab]?.name} size={size} />;
}

export function LabLink({ lab, className = "", size = 20 }: { lab: string; className?: string; size?: number }) {
  return (
    <Link href={`/labs/${lab}/`} className={`group/lab inline-flex min-w-0 items-center gap-2.5 ${className}`} title={labs[lab]?.name ?? lab}>
      <LabLogo lab={lab} size={size} />
      <span className="truncate group-hover/lab:underline group-hover/lab:underline-offset-4">{labs[lab]?.name ?? lab}</span>
    </Link>
  );
}

/** Band badge: an ascending 5-step glyph (filled steps = band) + label. Not color-dependent. */
export function BandBadge({ band, size = "sm" }: { band: string; size?: "sm" | "md" }) {
  const lvl = bandLevel(band);
  const h = size === "md" ? 14 : 11;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rule bg-raised ${size === "md" ? "px-3 py-1 text-[13px]" : "px-2 py-0.5 text-xs"}`}>
      <svg width={h + 4} height={h} viewBox="0 0 18 14" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={i * 3.6} y={14 - (i + 1) * 2.8} width={2.6} height={(i + 1) * 2.8} rx={0.6} fill={i < lvl ? "var(--band-on)" : "var(--band-off)"} />
        ))}
      </svg>
      {band}
    </span>
  );
}

export function Delta({ value, digits = 1, suffix = "" }: { value: number | null | undefined; digits?: number; suffix?: string }) {
  if (value == null) return <span className="text-ink-3">new</span>;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return <span className="tabular text-ink-3">–</span>;
  const up = rounded > 0;
  return (
    <span className={`tabular inline-flex items-center gap-0.5 ${up ? "text-good" : "text-bad"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "up" : "down"}</span>
      {fmtSigned(Math.abs(rounded), digits).replace("+", "")}
      {suffix}
    </span>
  );
}

export function Meter({ value, max = 1, color = "var(--ink)", height = 6, label }: { value: number; max?: number; color?: string; height?: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} className="relative w-full overflow-hidden rounded-full bg-sunken" style={{ height }}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Sparkline({ values, width = 96, height = 28, color = "var(--ink)" }: { values: (number | null)[]; width?: number; height?: number; color?: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const n = values.length - 1;
  const x = (i: number) => +(2 + (i / n) * (width - 6)).toFixed(2);
  const y = (v: number) => +(height - 3 - (v / 100) * (height - 6)).toFixed(2);
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const area = `${d}L${x(pts[pts.length - 1][0])},${height}L${x(pts[0][0])},${height}Z`;
  const [li, lv] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={area} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(li)} cy={y(lv)} r={2.5} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs leading-relaxed text-ink-3">{children}</p>;
}

export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3 py-1 text-xs text-ink-2 transition-colors hover:border-ink hover:text-ink">
      {children} <span aria-hidden="true">↗</span>
    </Link>
  );
}

/** A filled call to action, for the one link on a card we want people to follow. */
export function CtaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-page shadow-sm transition-transform hover:-translate-y-px hover:shadow-md"
    >
      {children}
      <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}
