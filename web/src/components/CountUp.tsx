"use client";

import { useEffect, useRef, useState } from "react";

import { easeInOutCubic } from "./charts/useTween";

/** Counts up to `value` once it scrolls into view. Server-renders the final value. */
export function CountUp({ value, digits = 1, duration = 1100, className = "" }: { value: number; digits?: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const k = easeInOutCubic(Math.min(1, (now - start) / duration));
        setShown(value * k);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);
  return (
    <span ref={ref} className={`tabular ${className}`}>
      {shown.toFixed(digits)}
    </span>
  );
}
