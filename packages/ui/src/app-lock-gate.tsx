import { Fingerprint, Lock } from "@phosphor-icons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
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
  /** Notified when the session is unlocked and when it locks again. */
  subscribeToUnlock: (listener: () => void) => () => void;
};

export type AppLockGateLabels = {
  /** The lock screen's accessible name — it shows no text of its own. */
  unlock: string;
  unlockFailed: string;
  turnOffLock: string;
  eraseDataWarningTitle: string;
  eraseDataWarningDescription: string;
  eraseDataConfirm: string;
  eraseDataCancel: string;
};

const lockedOnServer = () => false;

// Above anything the app can portal into <body> (drawers, popovers).
const overlayClassName =
  "bg-background fixed inset-0 z-[2147483647] overflow-y-auto";

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
 * Asks for the authenticator by itself whenever the lock screen is shown or
 * the user comes back to it — once per arrival, so cancelling the prompt
 * doesn't bring it straight back. Browsers that only prompt from a tap
 * refuse it; the lock screen's tap target covers that.
 */
function usePromptOnArrival(locked: boolean, prompt: () => void): void {
  useEffect(() => {
    if (!locked) return;
    let armed = true;
    function tryPrompt() {
      if (
        !armed ||
        document.visibilityState !== "visible" ||
        !document.hasFocus()
      ) {
        return;
      }
      armed = false;
      prompt();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") armed = true;
      else tryPrompt();
    }
    tryPrompt();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", tryPrompt);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", tryPrompt);
    };
  }, [locked, prompt]);
}

/**
 * Hides the app behind the platform-authenticator prompt while a lock is
 * enrolled and this session hasn't passed it — at launch, and again when
 * the lock relocks after time in the background. The prompt opens by
 * itself; the lock screen is the same for every app: a large fingerprint
 * that prompts when tapped, with no text (the apps ask for "your
 * fingerprint", though the OS picks how to verify). Renders nothing until `ready` — "no
 * lock" can't be told apart from "settings not loaded yet", and a locked
 * device must never flash unlocked.
 *
 * Once the app has been shown, relocking covers it rather than unmounting
 * it, so whatever the user was in the middle of is still there after
 * unlocking.
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
  const [appMounted, setAppMounted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showEscape, setShowEscape] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const checking = useRef(false);

  const locked = ready && enrolment !== null && !unlocked;
  if (ready && !locked && !appMounted) setAppMounted(true);

  // A prompt the browser refused on its own (no tap yet) isn't the device
  // letting the user down, so only a tapped one can fail.
  const unlock = useCallback(
    async (tapped: boolean) => {
      if (!enrolment || checking.current) return;
      checking.current = true;
      setFailed(false);
      const passed = await lock.verify(enrolment);
      checking.current = false;
      if (passed) setShowEscape(false);
      if (passed || !tapped) return;
      setFailed(true);
      setShowEscape(true);
    },
    [lock, enrolment],
  );
  const promptByItself = useCallback(() => void unlock(false), [unlock]);
  usePromptOnArrival(locked && !confirmErase, promptByItself);

  useEffect(() => {
    if (!locked) return;
    let active = true;
    void lock.isSupported().then((supported) => {
      if (active && !supported) setShowEscape(true);
    });
    return () => {
      active = false;
    };
  }, [lock, locked]);

  function turnOffLock() {
    // A gate-only lock never encrypted anything — nothing to warn about.
    if (!enrolment?.encryptionSupported) {
      lock.disable();
      return;
    }
    setConfirmErase(true);
  }

  if (!ready) return null;

  return (
    <>
      {appMounted && (
        <div className="contents" inert={locked}>
          {children}
        </div>
      )}
      {locked && (
        <div className={overlayClassName}>
          {confirmErase ? (
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
          ) : (
            <div className="grid min-h-dvh grid-rows-[1fr_auto]">
              <button
                type="button"
                aria-label={labels.unlock}
                className="grid place-items-center outline-none"
                onClick={() => void unlock(true)}
              >
                <Fingerprint
                  aria-hidden="true"
                  weight="light"
                  className="text-muted-foreground size-20"
                />
              </button>
              {showEscape && (
                <div className="grid justify-items-center gap-2 px-8 pb-12 text-center">
                  {failed && (
                    <p className="text-muted-foreground m-0 max-w-70 text-sm leading-normal">
                      {labels.unlockFailed}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    className="text-muted-foreground min-h-10.5"
                    onClick={turnOffLock}
                  >
                    {labels.turnOffLock}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
