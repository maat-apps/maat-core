import { Lock } from "@phosphor-icons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "./button";

/**
 * The parts of `@maat-apps/core/lock`'s `AppLock` the gate drives — typed
 * structurally so this package doesn't depend on core.
 */
export type AppLockGateLock<Enrolment> = {
  isSupported: () => Promise<boolean>;
  verify: (enrolment: Enrolment) => Promise<boolean>;
  disable: () => void;
  disableAndErase: () => Promise<void>;
  isSessionUnlocked: () => boolean;
  subscribeToUnlock: (listener: () => void) => () => void;
};

export type AppLockGateLabels = {
  lockedTitle: string;
  lockedDescription: string;
  unlock: string;
  unlockFailed: string;
  turnOffLock: string;
  eraseDataWarningTitle: string;
  eraseDataWarningDescription: string;
  eraseDataConfirm: string;
  eraseDataCancel: string;
};

const lockedOnServer = () => false;

function LockScreen({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid min-h-dvh w-[min(100%,480px)] content-center justify-items-center gap-4 px-8 text-center">
      <Lock aria-hidden="true" className="text-muted-foreground size-8" />
      <h1 className="font-heading m-0 text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground m-0 max-w-70 text-sm leading-normal">
        {description}
      </p>
      {children}
    </div>
  );
}

/**
 * Hides the app behind the platform-authenticator prompt while a lock is
 * enrolled and this session hasn't passed it. Renders nothing until
 * `ready` — "no lock" can't be told apart from "settings not loaded yet",
 * and a locked device must never flash unlocked.
 *
 * The "turn off the lock" escape hatch stays hidden until the device lets
 * the user down (a failed prompt, or no authenticator any more). When the
 * lock encrypts, turning it off without the key erases the data, so the
 * gate warns first.
 */
export function AppLockGate<
  Enrolment extends { encryptionSupported: boolean },
>({
  lock,
  enrolment,
  ready,
  labels,
  children,
}: {
  lock: AppLockGateLock<Enrolment>;
  enrolment: Enrolment | null;
  ready: boolean;
  labels: AppLockGateLabels;
  children: ReactNode;
}) {
  const unlocked = useSyncExternalStore(
    lock.subscribeToUnlock,
    lock.isSessionUnlocked,
    lockedOnServer,
  );
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showEscape, setShowEscape] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);

  const unlock = useCallback(async () => {
    if (!enrolment) return;
    setChecking(true);
    setFailed(false);
    const passed = await lock.verify(enrolment);
    setChecking(false);
    if (passed) return;
    setFailed(true);
    setShowEscape(true);
  }, [lock, enrolment]);

  useEffect(() => {
    if (!enrolment || unlocked) return;
    let active = true;
    void lock.isSupported().then((supported) => {
      if (active && !supported) setShowEscape(true);
    });
    return () => {
      active = false;
    };
  }, [lock, enrolment, unlocked]);

  function turnOffLock() {
    // A gate-only lock never encrypted anything — nothing to warn about.
    if (!enrolment?.encryptionSupported) {
      lock.disable();
      return;
    }
    setConfirmErase(true);
  }

  if (!ready) return null;
  if (!enrolment || unlocked) return <>{children}</>;

  if (confirmErase) {
    return (
      <LockScreen
        title={labels.eraseDataWarningTitle}
        description={labels.eraseDataWarningDescription}
      >
        <Button
          variant="outline"
          className="mt-2 min-h-12.5 px-6 text-base"
          onClick={() => void lock.disableAndErase()}
        >
          {labels.eraseDataConfirm}
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground min-h-10.5"
          onClick={() => setConfirmErase(false)}
        >
          {labels.eraseDataCancel}
        </Button>
      </LockScreen>
    );
  }

  return (
    <LockScreen
      title={labels.lockedTitle}
      description={failed ? labels.unlockFailed : labels.lockedDescription}
    >
      <Button
        className="mt-2 min-h-12.5 px-6 text-base"
        disabled={checking}
        onClick={() => void unlock()}
      >
        {labels.unlock}
      </Button>
      {showEscape && (
        <Button
          variant="ghost"
          className="text-muted-foreground min-h-10.5"
          onClick={turnOffLock}
        >
          {labels.turnOffLock}
        </Button>
      )}
    </LockScreen>
  );
}
