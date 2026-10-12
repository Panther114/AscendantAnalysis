"use client";

import { useEffect, useRef, useState } from "react";

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Smoothly interpolates a record of numeric arrays (null = gap) toward `target`.
 * Keys present only in `target` appear immediately (callers animate entry separately).
 * Reduced-motion users get a short tween instead of none.
 */
export function useTween(target: Record<string, (number | null)[]>, duration = 650) {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const dur = prefersReducedMotion() ? Math.min(200, duration) : duration;
    const start = performance.now();
    if (raf.current) cancelAnimationFrame(raf.current);
    const step = (now: number) => {
      const k = easeInOutCubic(Math.min(1, (now - start) / dur));
      const next: Record<string, (number | null)[]> = {};
      for (const key of Object.keys(target)) {
        const to = target[key];
        const fr = from[key];
        next[key] = to.map((v, i) => {
          const a = fr?.[i];
          return v == null || a == null ? v : a + (v - a) * k;
        });
      }
      fromRef.current = next;
      setShown(next);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when target content changes
  }, [JSON.stringify(target), duration]);

  return shown;
}
