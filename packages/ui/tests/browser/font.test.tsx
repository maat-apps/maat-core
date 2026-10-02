import { expect, it } from "vitest";

import "../../src/font";

// Guards maat-core#78: `@maat-apps/ui/font` must bring Outfit's files with
// it. load() fetches the face and finds none when a file is missing.
it("loads Outfit through @maat-apps/ui/font", async () => {
  const faces = await document.fonts.load('16px "Outfit Variable"');
  expect(faces.length).toBeGreaterThan(0);
});
