// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInstallPrompt, type InstalledFlag } from "../src/install";

// jsdom has no matchMedia; this stands in for the standalone media query.
function matchMediaMock(initialMatches: boolean) {
  let matches = initialMatches;
  return {
    get matches() {
      return matches;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    set(next: boolean) {
      matches = next;
    },
  };
}

function installedFlag(initial = false) {
  let installed = initial;
  const listeners = new Set<() => void>();
  const flag: InstalledFlag = {
    isInstalled: () => installed,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    markInstalled: vi.fn(() => {
      installed = true;
      for (const listener of listeners) listener();
    }),
  };
  return flag;
}

function promptEvent(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

let mql: ReturnType<typeof matchMediaMock>;

beforeEach(() => {
  mql = matchMediaMock(false);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderInstallPrompt(flag = installedFlag()) {
  const useInstallPrompt = createInstallPrompt(flag);
  return { flag, ...renderHook(() => useInstallPrompt()) };
}

describe("createInstallPrompt", () => {
  it("starts unavailable without a prompt", () => {
    const { result } = renderInstallPrompt();

    expect(result.current.state).toBe("unavailable");
  });

  it("does nothing on install() without a prompt", async () => {
    const { result } = renderInstallPrompt();

    await act(() => result.current.install());

    expect(result.current.state).toBe("unavailable");
  });

  it("reports installed, and records it, when running standalone", () => {
    mql.set(true);

    const { result, flag } = renderInstallPrompt();

    expect(result.current.state).toBe("installed");
    expect(flag.markInstalled).toHaveBeenCalled();
  });

  it("reports installed from the persisted flag alone", () => {
    const { result } = renderInstallPrompt(installedFlag(true));

    expect(result.current.state).toBe("installed");
  });

  it("becomes available on beforeinstallprompt, installed on acceptance", async () => {
    const { result } = renderInstallPrompt();
    const event = promptEvent("accepted");

    act(() => {
      window.dispatchEvent(event);
    });
    expect(result.current.state).toBe("available");
    await act(() => result.current.install());

    expect(event.prompt).toHaveBeenCalled();
    expect(result.current.state).toBe("installed");
  });

  it("goes back to unavailable after a dismissed prompt", async () => {
    const { result } = renderInstallPrompt();
    act(() => {
      window.dispatchEvent(promptEvent("dismissed"));
    });

    await act(() => result.current.install());

    expect(result.current.state).toBe("unavailable");
  });

  it("switches to installed and records it on appinstalled", () => {
    const { result, flag } = renderInstallPrompt();

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.state).toBe("installed");
    expect(flag.markInstalled).toHaveBeenCalled();
  });

  it("removes its window listeners on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderInstallPrompt();

    unmount();

    const types = remove.mock.calls.map(([type]) => type);
    expect(types).toEqual(
      expect.arrayContaining(["beforeinstallprompt", "appinstalled"]),
    );
    remove.mockRestore();
  });
});
