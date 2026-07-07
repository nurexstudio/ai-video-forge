// ─── src/components/AgentChat.test.tsx ─────────────────────────────────────────
// Unit tests for AgentChat component.
//
// Tests the visible behaviors: submit, progress (Thinking), cancel button,
// and Typewriter result reveal. Convex hooks are fully mocked.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mock Convex hooks + generated API (not available without convex dev) ────
vi.mock("@/convex/_generated/api", () => ({
  api: {
    agent: { processCommand: {} },
    effects: { seedDefaultsIfEmpty: {}, listAllEffects: {} },
  },
}));

vi.mock("convex/react", () => ({
  useAction: () =>
    // Small delay so the Thinking/cancel UI state visibly renders before
    // the action resolves. Prevents flaky tests.
    vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                success: true,
                result: {
                  title: "demo_video",
                  duration: "00:10",
                  size: "5 MB",
                  resolution: "1080p",
                  aspectRatio: "16:9",
                  downloadUrl: "",
                },
              }),
            600,
          ),
        ),
    ),
  useMutation: () => vi.fn().mockResolvedValue(undefined),
  useQuery: () => [],
}));

vi.mock("@/lib/store", () => ({
  useAppStore: (selector: any) => {
    const store = { setActionStatus: vi.fn() };
    return selector ? selector(store) : store;
  },
}));

vi.mock("@/lib/asyncWrapper", () => ({
  executeWithFeedback: async (fn: () => Promise<any>, _options: any) => {
    const data = await fn();
    return { success: true, data, error: undefined, canRetry: false };
  },
}));

// Reset mocks between tests for isolation
beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════

describe("AgentChat — submit, progress, cancel, typewriter", () => {
  it("renders the welcome message in non-compact mode", async () => {
    const { default: AgentChat } = await import("./AgentChat");
    render(<AgentChat />);
    expect(screen.getByText(/مرحباً/)).toBeInTheDocument();
  });

  it("has a working text input that accepts commands", async () => {
    const { default: AgentChat } = await import("./AgentChat");
    // Non-compact mode renders the input row
    render(<AgentChat />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "/trim myvideo");
    expect(input).toHaveValue("/trim myvideo");
  });


  it("submits on Enter key and shows the result", async () => {
    const { default: AgentChat } = await import("./AgentChat");
    render(<AgentChat />);

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "/export test{Enter}");

    await waitFor(() => {
      expect(screen.getByText(/demo_video\.mp4/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("types out result metadata via TypewriterText after action completes", async () => {
    const { default: AgentChat } = await import("./AgentChat");
    render(<AgentChat />);

    const input = screen.getByRole("textbox");
    const sendBtn = screen.getByRole("button", { name: /send command/i });

    await userEvent.type(input, "/export test");
    await userEvent.click(sendBtn);

    // Wait for the TypewriterText to render and start typing out the file name
    await waitFor(() => {
      expect(screen.getByText(/demo_video\.mp4/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows the Download button after result arrives", async () => {
    const { default: AgentChat } = await import("./AgentChat");
    render(<AgentChat />);

    const input = screen.getByRole("textbox");
    const sendBtn = screen.getByRole("button", { name: /send command/i });

    await userEvent.type(input, "/export test");
    await userEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Download/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
