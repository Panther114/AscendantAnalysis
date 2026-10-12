// Lab identity colors follow Artificial Analysis's per-creator brand colors (exported in
// labs.json). Each lab gets a CSS variable `--lab-<slug>` with a light and a dark value
// (near-black brand colors are lifted in dark mode so they stay visible). Identity is never
// color-alone: every colored mark ships with a monogram, name or direct label.

export function labColor(lab: string | null | undefined): string {
  return lab ? `var(--lab-${lab}, var(--other))` : "var(--other)";
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function luminance(hex: string): number {
  const lin = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Ink for text set on a filled mark of this color. */
export function inkOn(hex: string): string {
  return luminance(hex) > 0.42 ? "#0b0b0b" : "#ffffff";
}

/** Dark-mode step: lift very dark brand colors, keep the rest. */
export function darkStep(hex: string): string {
  return luminance(hex) < 0.05 ? "#e9e7e2" : hex;
}

/** CSS block defining --lab-<slug> for light and dark themes. */
export function labCss(labs: Record<string, { aa_color: string }>): string {
  const light = Object.entries(labs).map(([k, v]) => `--lab-${k}:${v.aa_color};--lab-${k}-ink:${inkOn(v.aa_color)};`).join("");
  const dark = Object.entries(labs)
    .map(([k, v]) => {
      const d = darkStep(v.aa_color);
      return `--lab-${k}:${d};--lab-${k}-ink:${inkOn(d)};`;
    })
    .join("");
  return `:root{${light}}@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])){${dark}}}:root[data-theme="dark"]{${dark}}`;
}

export const BAND_ORDER = ["Ascendant", "Contending", "Holding", "Slipping", "Fading"] as const;

/** Number of filled steps in the band glyph (Ascendant = 5 ... Fading = 1). */
export function bandLevel(band: string): number {
  const i = BAND_ORDER.indexOf(band as (typeof BAND_ORDER)[number]);
  return i < 0 ? 1 : 5 - i;
}
