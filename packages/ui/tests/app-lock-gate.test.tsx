import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AppLockGate,
  type AppLockGateLabels,
  type AppLockGateLock,
} from "../src/app-lock-gate";

type Enrolment = { encryptionSupported: boolean };

const labels: AppLockGateLabels = {
  lockedTitle: "Locked",
  lockedDescription: "Unlock to continue.",
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
  const markUnlocked = () => {
    unlocked = true;
    listeners.forEach((listener) => listener());
  };
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
  return lock;
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

describe("AppLockGate", () => {
  it("renders nothing until ready", () => {
    const { container } = renderGate(fakeLock(), null, false);

    expect(container.innerHTML).toBe("");
  });

  it("renders the app when no lock is enrolled", () => {
    renderGate(fakeLock(), null);

    expect(screen.getByText("App content")).toBeTruthy();
  });

  it("shows the lock screen while locked", () => {
    renderGate(fakeLock(), { encryptionSupported: false });

    expect(screen.getByRole("heading", { name: "Locked" })).toBeTruthy();
    expect(screen.queryByText("App content")).toBeNull();
  });

  it("renders the app after a successful unlock", async () => {
    renderGate(fakeLock(), { encryptionSupported: false });

    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("App content")).toBeTruthy();
  });

  it("offers the escape hatch only after a failed unlock", async () => {
    renderGate(fakeLock({ verify: failingVerify() }), {
      encryptionSupported: false,
    });
    expect(
      screen.queryByRole("button", { name: "Turn off the lock" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Turn off the lock" }),
    );

    expect(lock.disable).toHaveBeenCalled();
    expect(lock.disableAndErase).not.toHaveBeenCalled();
  });

  it("warns before erasing an encrypting lock's data", async () => {
    const lock = fakeLock({ verify: failingVerify() });
    renderGate(lock, { encryptionSupported: true });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn off the lock" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Locked" })).toBeTruthy(),
    );
  });
});
