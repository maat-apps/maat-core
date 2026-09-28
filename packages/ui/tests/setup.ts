import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// RTL only registers its own cleanup when it finds a *global* afterEach,
// which never happens without `test.globals` — unmount explicitly so no
// component (or its window listeners) outlives its test.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
