// Lab identity colors follow Artificial Analysis's per-creator brand colors (exported in
// labs.json). Each lab gets a CSS variable `--lab-<slug>` with a light and a dark value
// (brand colors too dark for the dark page are lightened, keeping their hue). Identity is never
// color-alone: every colored mark ships with a monogram, name or direct label.

export function labColor(lab: string | null | undefined): string {
  return lab ? `var(--lab-${lab}, var(--other))` : "var(--other)";
}

type RGB = [number, number, number];

const NEUTRAL_DARK = "#e9e7e2"; // stand-in for black/grey brands on the dark page
const DARK_MIN_LUMINANCE = 0.13; // >= 3:1 against the dark page (#0b0b0c)

/** Channels in [0, 1], or null when `hex` isn't #rgb / #rrggbb (the pipeline normalises to hex). */
function rgb(hex: string): RGB | null {
  const h = hex.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as RGB;
}

function lum([r, g, b]: RGB): number {
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function luminance(hex: string): number {
  const c = rgb(hex);
  return c ? lum(c) : 0;
}

function toHsl([r, g, b]: RGB): RGB {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function fromHsl([h, s, l]: RGB): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

function toHex(c: RGB): string {
  return `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Ink for text set on a filled mark of this color. */
export function inkOn(hex: string): string {
  return luminance(hex) > 0.42 ? "#0b0b0b" : "#ffffff";
}

/**
 * Dark-mode step: lift brand colors too dark to read on the dark page. Chromatic colors keep
 * their hue and saturation and only gain lightness (navy stays blue, teal stays teal); only
 * black/grey brands, which have no hue to keep, become the shared light neutral.
 */
export function darkStep(hex: string): string {
  const c = rgb(hex);
  if (!c) return NEUTRAL_DARK;
  if (lum(c) >= DARK_MIN_LUMINANCE) return hex;
  const [h, s, l] = toHsl(c);
  if (s < 0.15) return NEUTRAL_DARK;
  let lo = l;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (lum(fromHsl([h, s, mid])) < DARK_MIN_LUMINANCE) lo = mid;
    else hi = mid;
  }
  return toHex(fromHsl([h, s, hi]));
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

export const BAND_ORDER = ["Ascendant", "Contending", "Competitive", "Trailing", "Peripheral"] as const;

/** Number of filled steps in the band glyph (Ascendant = 5 ... Peripheral = 1). */
export function bandLevel(band: string): number {
  const i = BAND_ORDER.indexOf(band as (typeof BAND_ORDER)[number]);
  return i < 0 ? 1 : 5 - i;
}
