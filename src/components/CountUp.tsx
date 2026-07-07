// ─── src/components/CountUp.tsx ────────────────────────────────────────────────
// Animated number counter. Starts at 0 when first scrolled into view and
// animates up to `target` with an optional static `suffix` (e.g., "×", ":16", "K").
// Useful for stats counters in marketing pages.

import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue } from "framer-motion";

export interface CountUpProps {
  target: number;
  suffix?: string;
  duration?: number;
  /** Threshold for the visibility observer (0–1). Default 0.4. */
  threshold?: number;
  className?: string;
}

export function CountUp({
  target,
  suffix = "",
  duration = 1.6,
  threshold = 0.4,
  className,
}: CountUpProps) {
  const mv = useMotionValue(0);
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const controls = animate(mv, target, {
            duration,
            ease: [0.22, 1, 0.36, 1],
          });
          const unsub = mv.on("change", (v) => setVal(Math.floor(v)));
          return () => {
            controls.stop();
            unsub();
          };
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mv, target, duration, threshold]);

  return (
    <span ref={ref} className={className}>
      {val}
      {suffix}
    </span>
  );
}
