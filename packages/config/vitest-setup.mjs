import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no IndexedDB, and every app's storage builds on it.
import "fake-indexeddb/auto";

afterEach(async () => {
  // @testing-library/react only registers its own cleanup when it finds a
  // *global* afterEach, which never happens without `test.globals` — so
  // rendered components would stay mounted, their listeners outliving the
  // test (see maat-core/docs/testing-unit.md).
  cleanup();
  // Storage writes are fire-and-forget. A trailing delay lets this test's
  // last writes settle before the next test deletes the database; a
  // first-ever open also runs onupgradeneeded, so setTimeout(0) isn't enough.
  await new Promise((resolve) => setTimeout(resolve, 20));
});
