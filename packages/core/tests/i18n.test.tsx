// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createTranslation, formatMessage } from "../src/i18n";
import { createLocaleStore } from "../src/locale";
import type { KeyValueStore } from "../src/storage";

afterEach(() => cleanup());

const noStorage: KeyValueStore = {
  get: async () => undefined,
  set: async () => {},
  delete: async () => {},
};

const catalogs = {
  en: { greeting: "Hello, {name}!", done: "Done" },
  pl: { greeting: "Cześć, {name}!", done: "Gotowe" },
};

function setup() {
  const store = createLocaleStore({
    locales: ["en", "pl"] as const,
    fallbackLocale: "en",
    storage: noStorage,
    storageKey: "test-locale",
  });
  store.setLocale("en");
  return { store, useTranslation: createTranslation(store, catalogs) };
}

describe("formatMessage", () => {
  it("fills placeholders", () => {
    expect(formatMessage("{a} and {b}", { a: 1, b: "two" })).toBe("1 and two");
  });

  it("leaves unknown placeholders and param-less messages alone", () => {
    expect(formatMessage("{a} {missing}", { a: "x" })).toBe("x {missing}");
    expect(formatMessage("{a}")).toBe("{a}");
  });
});

describe("createTranslation", () => {
  it("translates from the current locale's catalog", () => {
    const { useTranslation } = setup();

    const { result } = renderHook(() => useTranslation());

    expect(result.current.t("greeting", { name: "Ana" })).toBe("Hello, Ana!");
  });

  it("re-renders in the new language after setLocale", () => {
    const { useTranslation } = setup();
    const { result } = renderHook(() => useTranslation());

    act(() => result.current.setLocale("pl"));

    expect(result.current.locale).toBe("pl");
    expect(result.current.t("done")).toBe("Gotowe");
  });

  it("follows a locale change made outside React", () => {
    const { store, useTranslation } = setup();
    const { result } = renderHook(() => useTranslation());

    act(() => store.setLocale("pl"));

    expect(result.current.t("done")).toBe("Gotowe");
  });

  it("types keys from the catalogs", () => {
    const { useTranslation } = setup();
    const { result } = renderHook(() => useTranslation());

    // Compile-time only: typecheck fails if "nope" ever becomes a valid key.
    const typeCheck = () => {
      // @ts-expect-error — not a key in the catalogs.
      result.current.t("nope");
    };

    expect(typeCheck).toBeTypeOf("function");
  });
});
