import { useSyncExternalStore } from "react";
import en from "./en.json";

// A small useSyncExternalStore-backed locale store, not a library — see
// maat-core/STRUCTURE.md's i18n section for the reasoning. Add more
// catalogs (e.g. pl.json) and locale-detection/persistence as this app
// needs them; this is the minimal single-locale starting point.
type Catalog = typeof en;
const catalogs = { en };
let locale: keyof typeof catalogs = "en";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return locale;
}

export function setLocale(next: keyof typeof catalogs) {
  locale = next;
  listeners.forEach((listener) => listener());
}

export function useTranslation() {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  const catalog = catalogs[current];

  function t(key: keyof Catalog, params?: Record<string, string | number>) {
    let message: string = catalog[key];
    if (params) {
      for (const [param, value] of Object.entries(params)) {
        message = message.replaceAll(`{${param}}`, String(value));
      }
    }
    return message;
  }

  return { t, locale: current };
}
