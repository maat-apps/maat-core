import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// The "Install app" button's state: available (Chromium offered
// beforeinstallprompt), installed, or unavailable (iOS Safari, dismissed).

// Not in lib.dom yet — Chromium-only.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = "unavailable" | "available" | "installed";

/**
 * Where the app persists "this browser has installed the app" — Chrome stops
 * re-offering the prompt once installed, even from a plain browser tab that
 * never sees standalone mode, so this is the only record of it. Typically a
 * `persisted` store's `installed` field.
 */
export type InstalledFlag = {
  isInstalled(): boolean;
  subscribe(listener: () => void): () => void;
  markInstalled(): void;
};

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeToDisplayMode(listener: () => void): () => void {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function isStandalone(): boolean {
  // iOS Safari predates the display-mode media query and sets its own flag.
  const iosNavigator = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    iosNavigator.standalone === true
  );
}

function notStandaloneOnServer(): boolean {
  return false;
}

/** Returns the app's `useInstallPrompt` hook, bound to its installed flag. */
export function createInstallPrompt(installed: InstalledFlag) {
  function notInstalledOnServer(): boolean {
    return false;
  }

  return function useInstallPrompt(): {
    state: InstallState;
    install: () => Promise<void>;
  } {
    const standalone = useSyncExternalStore(
      subscribeToDisplayMode,
      isStandalone,
      notStandaloneOnServer,
    );
    const persistedInstalled = useSyncExternalStore(
      installed.subscribe,
      installed.isInstalled,
      notInstalledOnServer,
    );
    const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [justInstalled, setJustInstalled] = useState(false);

    useEffect(() => {
      function onBeforeInstallPrompt(event: Event) {
        // Keep the event so the button can replay it on a user gesture.
        event.preventDefault();
        setPrompt(event as BeforeInstallPromptEvent);
      }

      function onInstalled() {
        setPrompt(null);
        setJustInstalled(true);
        installed.markInstalled();
      }

      window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.addEventListener("appinstalled", onInstalled);
      return () => {
        window.removeEventListener(
          "beforeinstallprompt",
          onBeforeInstallPrompt,
        );
        window.removeEventListener("appinstalled", onInstalled);
      };
    }, []);

    useEffect(() => {
      if (standalone) installed.markInstalled();
    }, [standalone]);

    const install = useCallback(async () => {
      if (!prompt) return;
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // The event is single-use whatever the answer.
      setPrompt(null);
      if (outcome === "accepted") setJustInstalled(true);
    }, [prompt]);

    const state: InstallState =
      standalone || justInstalled || persistedInstalled
        ? "installed"
        : prompt
          ? "available"
          : "unavailable";

    return { state, install };
  };
}
