import { useSyncExternalStore } from "react";
import type { LocaleStore } from "./locale";

// The React half of i18n: a `useTranslation` hook bound to one app's locale
// store and message catalogs. No provider — the store is a singleton.

export type MessageParams = Record<string, string | number>;

// Hoisted: `t()` runs for every visible string on every render.
// String.replace resets a global regex's lastIndex before each use.
const placeholderPattern = /\{(\w+)\}/g;

/** Replaces `{name}` placeholders; unknown placeholders are left as-is. */
export function formatMessage(message: string, params?: MessageParams): string {
  if (!params) return message;
  return message.replace(placeholderPattern, (match, token: string) =>
    token in params ? String(params[token]) : match,
  );
}

export type Translation<L extends string, K extends string> = {
  locale: L;
  setLocale: (locale: L) => void;
  t: (key: K, params?: MessageParams) => string;
};

/**
 * Binds a locale store to the app's catalogs and returns its
 * `useTranslation` hook. `t()` accepts only keys present in *every*
 * catalog, so a key missing from one language fails to compile:
 *
 * ```ts
 * import en from "./en.json";
 * import pl from "./pl.json";
 * export const useTranslation = createTranslation(localeStore, { en, pl });
 * ```
 */
export function createTranslation<
  L extends string,
  C extends Record<L, Record<string, string>>,
>(store: LocaleStore<L>, catalogs: C) {
  type Key = Extract<keyof C[L], string>;

  return function useTranslation(): Translation<L, Key> {
    const locale = useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    );

    return {
      locale,
      setLocale: store.setLocale,
      t: (key, params) => formatMessage(catalogs[locale][key], params),
    };
  };
}
