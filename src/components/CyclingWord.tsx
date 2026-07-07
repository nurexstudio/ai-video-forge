// ─── src/components/CyclingWord.tsx ─────────────────────────────────────────────
// Cycles through a list of highlighted words inside a fixed-width container so
// the surrounding layout doesn't shift. Uses AnimatePresence for crossfade
// + slide transitions; aria-live="polite" notes screen readers on change.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface CyclingWordProps {
  words?: string[];
  /** Delay between cycles in milliseconds. Default 3000. */
  intervalMs?: number;
  /** Estimated width of the longest word (counts in 'ch' units). */
  minWidthCh?: number;
  transitionDurationSec?: number;
}

const DEFAULT_WORDS = ["finished video", "publishable cut", "production-ready edit"];

export function CyclingWord({
  words = DEFAULT_WORDS,
  intervalMs = 3000,
  minWidthCh = 12,
  transitionDurationSec = 0.55,
}: CyclingWordProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (words.length <= 1) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % words.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [words.length, intervalMs]);

  return (
    <span
      className="relative inline-block align-baseline"
      style={{ minWidth: `${minWidthCh}ch` }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
          transition={{ duration: transitionDurationSec, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 bg-accent px-3 py-1 inline-block whitespace-nowrap"
        >
          {words[index]}
          <span className="absolute -inset-1.5 border-2 border-black -z-0" aria-hidden />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
