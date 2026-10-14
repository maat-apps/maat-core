import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AppLockGate,
  type AppLockGateLabels,
  type AppLockGateLock,
} from "../src/app-lock-gate";

type Enrolment = { encryptionSupported: boolean };

const labels: AppLockGateLabels = {
  unlock: "Unlock",
  unlockFailed: "That did not work.",
  turnOffLock: "Turn off the lock",
  eraseDataWarningTitle: "This erases your data",
  eraseDataWarningDescription: "It can't be recovered.",
  eraseDataConfirm: "Erase and continue",
  eraseDataCancel: "Cancel",
};

function fakeLock(overrides: Partial<AppLockGateLock<Enrolment>> = {}) {
  let unlocked = false;
  const listeners = new Set<() => void>();
  const setUnlocked = (next: boolean) => {
    unlocked = next;
    listeners.forEach((listener) => listener());
  };
  const markUnlocked = () => setUnlocked(true);
  const lock: AppLockGateLock<Enrolment> = {
    isSupported: vi.fn(() => Promise.resolve(true)),
    verify: vi.fn(async () => {
      markUnlocked();
      return true;
    }),
    disable: vi.fn(markUnlocked),
    disableAndErase: vi.fn(async () => markUnlocked()),
    isSessionUnlocked: () => unlocked,
    subscribeToUnlock: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...overrides,
  };
  return Object.assign(lock, { relock: () => setUnlocked(false) });
}

function renderGate(
  lock: AppLockGateLock<Enrolment>,
  enrolment: Enrolment | null,
  ready = true,
) {
  return render(
    <AppLockGate
      lock={lock}
      enrolment={enrolment}
      ready={ready}
      labels={labels}
    >
      <p>App content</p>
    </AppLockGate>,
  );
}

const failingVerify = () => vi.fn(() => Promise.resolve(false));

const unlockButton = () => screen.getByRole("button", { name: "Unlock" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppLockGate", () => {
  it("renders nothing until ready", () => {
    const { container } = renderGate(fakeLock(), null, false);

    expect(container.innerHTML).toBe("");
  });

  it("renders the app when no lock is enrolled", () => {
    renderGate(fakeLock(), null);

    expect(screen.getByText("App content")).toBeTruthy();
  });

  it("shows a text-free lock screen while locked", () => {
    const { container } = renderGate(fakeLock(), {
      encryptionSupported: false,
    });

    expect(unlockButton()).toBeTruthy();
    expect(container.textContent).toBe("");
  });

  it("prompts by itself when the page has focus", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const lock = fakeLock();

    renderGate(lock, { encryptionSupported: false });

    expect(await screen.findByText("App content")).toBeTruthy();
    expect(lock.verify).toHaveBeenCalledTimes(1);
  });

  it("waits for focus before prompting by itself", async () => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const lock = fakeLock();
    renderGate(lock, { encryptionSupported: false });
    expect(lock.verify).not.toHaveBeenCalled();

    hasFocus.mockReturnValue(true);
    fireEvent.focus(window);

    expect(await screen.findByText("App content")).toBeTruthy();
  });

  it("doesn't count a prompt it opened by itself as failed", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const lock = fakeLock({ verify: failingVerify() });

    renderGate(lock, { encryptionSupported: false });

    await waitFor(() => expect(lock.verify).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("That did not work.")).toBeNull();
    fireEvent.focus(window);
    expect(lock.verify).toHaveBeenCalledTimes(1);
  });

  it("covers the app without unmounting it when relocked", async () => {
    const lock = fakeLock();
    const seen = vi.fn();
    function Probe() {
      useEffect(() => seen(), []);
      return <p>App content</p>;
    }
    render(
      <AppLockGate
        lock={lock}
        enrolment={{ encryptionSupported: false }}
        ready
        labels={labels}
      >
        <Probe />
      </AppLockGate>,
    );
    fireEvent.click(unlockButton());
    await screen.findByText("App content");

    act(() => lock.relock());

    expect(unlockButton()).toBeTruthy();
    expect(screen.getByText("App content").closest("[inert]")).toBeTruthy();
    fireEvent.click(unlockButton());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Unlock" })).toBeNull(),
    );
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("renders the app after a successful unlock", async () => {
    renderGate(fakeLock(), { encryptionSupported: false });

    fireEvent.click(unlockButton());

    expect(await screen.findByText("App content")).toBeTruthy();
  });

  it("offers the escape hatch only after a failed unlock", async () => {
    renderGate(fakeLock({ verify: failingVerify() }), {
      encryptionSupported: false,
    });
    expect(
      screen.queryByRole("button", { name: "Turn off the lock" }),
    ).toBeNull();

    fireEvent.click(unlockButton());

    expect(await screen.findByText("That did not work.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Turn off the lock" }),
    ).toBeTruthy();
  });

  it("offers the escape hatch when the authenticator is gone", async () => {
    renderGate(fakeLock({ isSupported: vi.fn(() => Promise.resolve(false)) }), {
      encryptionSupported: false,
    });

    expect(
      await screen.findByRole("button", { name: "Turn off the lock" }),
    ).toBeTruthy();
  });

  it("turns a gate-only lock off without warning", async () => {
    const lock = fakeLock({ verify: failingVerify() });
    renderGate(lock, { encryptionSupported: false });
    fireEvent.click(unlockButton());

    fireEvent.click(
      await screen.findByRole("button", { name: "Turn off the lock" }),
    );

    expect(lock.disable).toHaveBeenCalled();
    expect(lock.disableAndErase).not.toHaveBeenCalled();
  });

  it("warns before erasing an encrypting lock's data", async () => {
    const lock = fakeLock({ verify: failingVerify() });
    renderGate(lock, { encryptionSupported: true });
    fireEvent.click(unlockButton());
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn off the lock" }),
    );

    expect(
      screen.getByRole("heading", { name: "This erases your data" }),
    ).toBeTruthy();
    expect(lock.disable).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Erase and continue" }),
      );
    });

    expect(lock.disableAndErase).toHaveBeenCalled();
    expect(screen.getByText("App content")).toBeTruthy();
  });

  it("goes back to the lock screen when erasing is cancelled", async () => {
    renderGate(fakeLock({ verify: failingVerify() }), {
      encryptionSupported: true,
    });
    fireEvent.click(unlockButton());
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn off the lock" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(unlockButton()).toBeTruthy());
  });
});
