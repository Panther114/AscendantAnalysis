export function fmtHealth(x: number | null | undefined): string {
  return x == null ? "—" : x.toFixed(1);
}

export function fmtPct(x: number | null | undefined, digits = 0): string {
  return x == null ? "—" : `${(x * 100).toFixed(digits)}%`;
}

export function fmtUsd(x: number | null | undefined): string {
  if (x == null) return "—";
  if (x >= 100) return `$${x.toFixed(0)}`;
  if (x >= 1) return `$${x.toFixed(2)}`;
  if (x >= 0.01) return `$${x.toFixed(3)}`;
  return `$${x.toPrecision(2)}`;
}

export function fmtMult(x: number | null | undefined): string {
  return x == null ? "—" : `×${x.toFixed(2)}`;
}

export function fmtSigned(x: number | null | undefined, digits = 1): string {
  if (x == null) return "—";
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s;
}

export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function fmtShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function ratio(x: number | null | undefined): string {
  if (x == null) return "—";
  const r = Math.exp(Math.abs(x));
  return `${r.toFixed(r >= 10 ? 0 : 1)}×`;
}

export const TIER_LABEL = { frontier: "Frontier", mid: "Mid", small: "Small" } as const;

export const AXIS_LABEL = {
  intelligence: "Intelligence",
  efficiency: "Efficiency",
  value: "Value",
  speed: "Speed",
} as const;
