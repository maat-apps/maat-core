import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { MobileGate } from "../../src/mobile-gate";

// getByText, not getByRole: a hidden heading drops out of the
// accessibility tree, so a role query wouldn't find it to assert on.
function renderGate() {
  render(
    <MobileGate message="Phones only">
      <h1>The app</h1>
    </MobileGate>,
  );
}

describe("MobileGate in a real viewport", () => {
  it("shows the app on a phone in portrait", async () => {
    await page.viewport(390, 844);
    renderGate();

    await expect.element(page.getByText("The app")).toBeVisible();
    await expect.element(page.getByText("Phones only")).not.toBeVisible();
  });

  it("shows the app on a phone in landscape", async () => {
    // Width alone reads like a desktop; the narrow dimension decides.
    await page.viewport(844, 390);
    renderGate();

    await expect.element(page.getByText("The app")).toBeVisible();
    await expect.element(page.getByText("Phones only")).not.toBeVisible();
  });

  it("shows the message on a desktop window", async () => {
    await page.viewport(1280, 800);
    renderGate();

    await expect.element(page.getByText("Phones only")).toBeVisible();
    await expect.element(page.getByText("The app")).not.toBeVisible();
  });
});
