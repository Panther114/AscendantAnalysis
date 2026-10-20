import logos from "@/lib/logos.json";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Lab logo with no border or backdrop on light pages; dark pages get a white rounded tile so dark glyphs stay legible.
 * Client-safe: depends only on the small logo manifest, not on the dataset.
 */
export function LabMark({ lab, name, size = 20 }: { lab: string; name?: string; size?: number }) {
  const logo = (logos as Record<string, { file: string }>)[lab];
  const pad = Math.max(2, Math.round(size * 0.14));
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center overflow-hidden rounded-[22%]"
      style={{ width: size, height: size, padding: pad, background: "var(--logo-tile)" }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- static export, tiny SVGs
        <img src={`${BASE}/logos/${logo.file}`} alt="" width={size - pad * 2} height={size - pad * 2} className="h-full w-full object-contain" loading="lazy" decoding="async" />
      ) : (
        <span className="text-[10px] font-semibold text-black">{(name ?? lab).slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}
