import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { setLocale, useTranslation } from "@/i18n/use-translation";

describe("useTranslation", () => {
  it("returns the current locale and its catalog's messages", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.locale).toBe("en");
    expect(result.current.t("welcome")).toBe("Welcome");
  });

  it("leaves the message unchanged when no param matches a placeholder", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("welcome", { unused: "value" })).toBe("Welcome");
  });

  it("updates every subscribed hook instance in the same tick on locale switch", () => {
    const first = renderHook(() => useTranslation());
    const second = renderHook(() => useTranslation());

    act(() => {
      setLocale("en");
    });

    expect(first.result.current.locale).toBe("en");
    expect(second.result.current.locale).toBe("en");
  });

  it("stops notifying a hook instance once it unmounts", () => {
    const { result, unmount } = renderHook(() => useTranslation());
    unmount();
    expect(() => {
      act(() => {
        setLocale("en");
      });
    }).not.toThrow();
    expect(result.current.locale).toBe("en");
  });
});
