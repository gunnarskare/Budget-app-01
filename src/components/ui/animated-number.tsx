"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney, type MoneyOptions } from "@/lib/format";

/** Teller opp til verdien første gang den vises (respekterer «reduser bevegelse»). */
export function AnimatedMoney({ value, duration = 900, ...opts }: { value: number; duration?: number } & MoneyOptions) {
  const [shown, setShown] = useState(value);
  const first = useRef(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!first.current || reduce) {
      first.current = false;
      setShown(value);
      return;
    }
    first.current = false;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular-nums">{formatMoney(shown, opts)}</span>;
}
