// ─── src/components/EditorMockup.test.tsx ────────────────────────────────────
// Static, presentational tests for the EditorMockup decompositional. No motion,
// no state — just render and assert on headline UI markers.
//
// Selectors:
//   - `getContainer()`: the root .relative.border-2 … .shadow-[…_.…__…_…] node
//   - query strings anchored on stable markup (e.g. "ClipForge Studio" text,
//     "Timeline" label, "FPS 30", "00:42 / 00:58") to avoid brittleness from
//     future styling tweaks.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EditorMockup from "./EditorMockup";

describe("EditorMockup", () => {
  it("renders the root frame with the neobrutalism shadow and border", () => {
    const { container } = render(<EditorMockup />);
    const root = container.querySelector(".shadow-\\[10px_10px_0px_\\#000\\]") as HTMLElement;
    expect(root).toBeInTheDocument();
    expect(root.className).toMatch(/border-2/);
    expect(root.className).toMatch(/border-black/);
    expect(root.className).toMatch(/bg-white/);
  });

  it("displays the 'ClipForge Studio' title", () => {
    render(<EditorMockup />);
    expect(screen.getByText(/ClipForge Studio/i)).toBeInTheDocument();
  });

  it("shows the timeline counter '00:42 / 00:58'", () => {
    render(<EditorMockup />);
    expect(screen.getByText("00:42 / 00:58")).toBeInTheDocument();
  });

  it("renders an aspect-video preview container", () => {
    const { container } = render(<EditorMockup />);
    const preview = container.querySelector(".aspect-video") as HTMLElement;
    expect(preview).toBeInTheDocument();
    // Preview container must be part of a 12-col grid (col-span-7)
    expect(preview.className).toMatch(/col-span-7/);
  });

  it("renders the Timeline label and FPS 30 marker", () => {
    render(<EditorMockup />);
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.getByText("FPS 30")).toBeInTheDocument();
  });

  it("renders all four sidebar items with Captions marked active", () => {
    render(<EditorMockup />);
    expect(screen.getByText("Media")).toBeInTheDocument();
    expect(screen.getByText("Captions")).toBeInTheDocument();
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(screen.getByText("FX")).toBeInTheDocument();

    // Captions has `bg-accent` while the others don't.
    const captions = screen.getByText("Captions").parentElement as HTMLElement;
    expect(captions.className).toMatch(/bg-accent/);
    const media = screen.getByText("Media").parentElement as HTMLElement;
    expect(media.className).not.toMatch(/bg-accent/);
  });

  it("renders the caption overlay 'Then it vanished.' in the preview", () => {
    render(<EditorMockup />);
    expect(screen.getByText(/Then it vanished\./)).toBeInTheDocument();
  });

  it("renders four timeline clip bars with different widths", () => {
    const { container } = render(<EditorMockup />);
    const timelineBars = container.querySelectorAll(".bg-accent, .bg-blue-500, .bg-black\\/10, .bg-black\\/5");
    expect(timelineBars.length).toBeGreaterThanOrEqual(4);
  });

  it("renders the bottom audio level row with '00:42' and '-3dB'", () => {
    const { container } = render(<EditorMockup />);
    // Scope the lookup to the bottom audio row so we don't pick up the top
    // bar counter `00:42 / 00:58` that also contains "00:42". The audio row
    // is the timeline block's last child (`mt-auto` pushes it down).
    const audioRow = container.querySelector(
      "[class*='mt-auto'][class*='flex'][class*='gap-1']",
    ) as HTMLElement;
    expect(audioRow).toBeInTheDocument();
    expect(audioRow).toHaveTextContent("00:42");
    expect(audioRow).toHaveTextContent("-3dB");
  });

  it("renders the preview-resolution label 'Preview · 1080×1920'", () => {
    render(<EditorMockup />);
    expect(screen.getByText(/Preview · 1080×1920/i)).toBeInTheDocument();
  });
});
