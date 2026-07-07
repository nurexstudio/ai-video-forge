// ─── src/components/TypewriterText.test.tsx ────────────────────────────────────
// Isolated unit tests for the TypewriterText component (exported from AgentChat).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

import { TypewriterText } from "./AgentChat";

describe("TypewriterText", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function container(): HTMLElement {
    return document.querySelector(".whitespace-pre-wrap")!;
  }
  function getCursor(): Element | null {
    return document.querySelector(".animate-pulse");
  }

  /**
   * Advance timers in bursts, flushing React after each burst so the
   * next setTimeout chain gets scheduled. Each call unblocks one tick
   * cycle + the resulting re-render.
   */
  async function tickAndFlush(ms: number, times = 1) {
    for (let i = 0; i < times; i++) {
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
    }
  }

  // ── Tests ──────────────────────────────────────────────────────────────────

  it("displays a blinking cursor while text is empty", () => {
    render(<TypewriterText text="Hello" speed={10} />);
    expect(container()).toBeInTheDocument();
    expect(getCursor()).toBeInTheDocument();
    expect(container().textContent).toBe("");
  });

  it("reveals characters after a single tick", async () => {
    render(<TypewriterText text="ABC" speed={20} />);
    // 50ms > speed+max-jitter (32ms) → ensures the first tick fires
    await tickAndFlush(50);
    const len = container().textContent!.length;
    expect(len).toBeGreaterThan(0);
    expect(len).toBeLessThan(4);
  });

  it("shows the full text after running all timer cycles", async () => {
    render(<TypewriterText text="Hello World" speed={2} />);
    // Run many tick+flush cycles; worst-case text length is ~11 chars
    await tickAndFlush(20, 20);
    expect(container().textContent).toBe("Hello World");
  });

  it("hides the cursor after typing completes", async () => {
    render(<TypewriterText text="AB" speed={1} />);
    await tickAndFlush(10, 20);
    expect(getCursor()).not.toBeInTheDocument();
  });

  it("calls onDone when typing finishes", async () => {
    const onDone = vi.fn();
    render(<TypewriterText text="Hi" speed={1} onDone={onDone} />);
    await tickAndFlush(10, 20);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("resets when the text prop changes", async () => {
    const { rerender } = render(<TypewriterText text="First" speed={1} />);
    await tickAndFlush(10, 20);
    expect(container().textContent).toBe("First");

    rerender(<TypewriterText text="Second" speed={1} />);
    // After rerender the displayed text resets to empty
    expect(container().textContent).toBe("");

    await tickAndFlush(10, 20);
    expect(container().textContent).toBe("Second");
  });

  it("renders multi-line text with newlines", async () => {
    render(<TypewriterText text="Line 1\nLine 2" speed={1} />);
    await tickAndFlush(10, 20);
    const content = container().textContent!;
    expect(content).toContain("Line 1");
    expect(content).toContain("Line 2");
  });

  it("respects the speed prop: slower speed delays typing", async () => {
    render(<TypewriterText text="XYZ" speed={500} />);
    await tickAndFlush(50);
    // After 50ms, a 500ms tick hasn't elapsed yet
    expect(container().textContent).toBe("");
  });
});
