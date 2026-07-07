// ─── src/pages/Landing.test.tsx ────────────────────────────────────────────────
// Unit tests for `CountUp` (IntersectionObserver-driven counter) and
// `CyclingWord` (interval-driven keyword cycler) components, exported
// from src/pages/Landing.tsx.
//
// Strategy:
//   - Mock the global IntersectionObserver (jsdom doesn't provide one).
//   - For CountUp, use real timers + a short `duration` so the framer-motion
//     `animate()` runs quickly and we can assert the final value via waitFor.
//   - For CyclingWord, use real timers too because AnimatePresence's exits
//     run on rAF which fake timers don't flush. The component uses a 3s
//     internal setInterval; tests simply wait for each transition.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, screen, act } from "@testing-library/react";
import { CountUp } from "@/components/CountUp";
import { CyclingWord } from "@/components/CyclingWord";

// ═══ IntersectionObserver mock ═══════════════════════════════════════════════
type IOInstance = {
  cb: IntersectionObserverCallback;
  el: Element;
  threshold: number;
};
const ioRegistry: IOInstance[] = [];

class MockIntersectionObserver {
  cb: IntersectionObserverCallback;
  threshold: number;
  root: Element | null = null;
  rootMargin = "";
  thresholds: number[] = [];

  constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
    this.cb = cb;
    this.threshold = (opts?.threshold as number) ?? 0;
    this.root = (opts?.root as Element | null) ?? null;
    this.rootMargin = opts?.rootMargin ?? "";
    this.thresholds = Array.isArray(opts?.threshold)
      ? opts.threshold
      : [this.threshold];
  }
  observe(el: Element) {
    ioRegistry.push({ cb: this.cb, el, threshold: this.threshold });
  }
  unobserve() {}
  disconnect() {
    ioRegistry.length = 0;
  }
  takeRecords() {
    return [];
  }
}

// Install mock on global. jsdom doesn't provide IntersectionObserver.
(globalThis as any).IntersectionObserver = MockIntersectionObserver;

/** Trigger intersection for one of the observed elements. */
function triggerIntersect(el: Element, isIntersecting: boolean) {
  for (let i = ioRegistry.length - 1; i >= 0; i--) {
    if (ioRegistry[i].el === el) {
      const inst = ioRegistry[i];
      ioRegistry.splice(i, 1);
      act(() => {
        inst.cb(
          [
            {
              isIntersecting,
              intersectionRatio: isIntersecting ? 0.5 : 0,
              target: el,
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: Date.now(),
            },
          ],
          {} as IntersectionObserver,
        );
      });
      break;
    }
  }
}

// ═══ Tests ═════════════════════════════════════════════════════════════════════

beforeEach(() => {
  ioRegistry.length = 0;
});

afterEach(() => {
  ioRegistry.length = 0;
});

describe("CountUp", () => {
  it("renders 0 initially before intersection", () => {
    const { container } = render(<CountUp target={42} />);
    const span = container.querySelector("span")!;
    expect(span.textContent).toBe("0");
  });

  it("renders the suffix paired with the initial 0 before intersection", () => {
    const { container } = render(<CountUp target={9} suffix=":16" />);
    const span = container.querySelector("span")!;
    // CountUp always renders `{val}{suffix}`, so before intersection the
    // visible text is `0` + the static suffix `":16"` = `"0:16"`.
    expect(span.textContent).toBe("0:16");
  });

  it("counts up to the target value after intersection", async () => {
    const { container } = render(<CountUp target={16} duration={0.05} />);
    const span = container.querySelector("span")!;
    expect(span.textContent).toBe("0");

    triggerIntersect(span, true);

    // Wait for the short animation + React flush.
    await waitFor(
      () => {
        expect(span.textContent).toBe("16");
      },
      { timeout: 1500, interval: 16 },
    );
  });

  it("counts up with a suffix preserved", async () => {
    const { container } = render(
      <CountUp target={4} suffix="K" duration={0.05} />,
    );
    const span = container.querySelector("span")!;
    triggerIntersect(span, true);
    await waitFor(
      () => {
        expect(span.textContent).toBe("4K");
      },
      { timeout: 1500, interval: 16 },
    );
  });

  it("does not start animating when not intersecting", async () => {
    const { container } = render(<CountUp target={50} duration={0.05} />);
    const span = container.querySelector("span")!;
    triggerIntersect(span, false);
    // Wait long enough that any (incorrect) animation would have finished.
    await new Promise((r) => setTimeout(r, 200));
    expect(span.textContent).toBe("0");
  });

  it("only animates once even if intersected repeatedly", async () => {
    const { container } = render(<CountUp target={7} duration={0.05} />);
    const span = container.querySelector("span")!;
    triggerIntersect(span, true);
    await waitFor(
      () => {
        expect(span.textContent).toBe("7");
      },
      { timeout: 1500, interval: 16 },
    );
    // Note: count is `started` via startedRef; subsequent intersection events
    // shouldn't restart the animation. We just confirm it stays at 7.
    triggerIntersect(span, true);
    await new Promise((r) => setTimeout(r, 100));
    expect(span.textContent).toBe("7");
  });
});

describe("CyclingWord", () => {
  it("renders the first word initially", () => {
    const { container } = render(<CyclingWord />);
    expect(container.textContent).toContain("finished video");
  });

  it("marks the highlighted span with aria-live=polite for screen readers", () => {
    const { container } = render(<CyclingWord />);
    expect(container.querySelector("[aria-live='polite']")).toBeInTheDocument();
  });

  it("cycles to the second word after ~3s", async () => {
    const { container } = render(<CyclingWord />);
    expect(container.textContent).toContain("finished video");

    // Real timers + 3s interval. AnimatePresence may still be transitioning
    // even after the index updates; we wait for the next word to appear.
    await waitFor(
      () => {
        expect(container.textContent).toContain("publishable cut");
      },
      { timeout: 6000, interval: 200 },
    );
  });

  it(
    "cycles to the third word after ~6s",
    async () => {
      const { container } = render(<CyclingWord />);
      await waitFor(
        () => {
          expect(container.textContent).toContain("production-ready edit");
        },
        { timeout: 12000, interval: 200 },
      );
    },
    15000, // vitest per-test timeout (default 5s is too short for ~10s of cycles)
  );

  it("supports the rendered word styles consistently across variants", () => {
    const { container } = render(<CyclingWord />);
    const span = container.querySelector(".bg-accent");
    expect(span).toBeInTheDocument();
    // Each rendered word sits inside the same styled container.
    expect(span?.textContent).toMatch(/finished video|publishable cut|production-ready edit/);
  });
});
