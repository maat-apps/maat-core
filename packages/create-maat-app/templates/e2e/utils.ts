// Reusable Playwright test helpers — plain functions specs call directly,
// not test.extend() fixtures (hence "utils.ts", not "fixtures.ts" — see
// maat-core/STRUCTURE.md's Testing section for why that naming matters).
import { readStored } from "@maat-apps/config/playwright";
import { expect, type Page } from "@playwright/test";

export async function goHome(page: Page) {
  await page.goto("");
}

export async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
}

/**
 * Resolves once the app-lock enrolment has reached IndexedDB. Settings
 * persist in the background, so a reload right after enrolling can lose
 * it and the app comes back unlocked.
 */
export async function waitForStoredLock(page: Page) {
  await expect
    .poll(async () => {
      const settings = (await readStored(
        page,
        "{{APP_NAME}}",
        "{{APP_NAME}}-settings",
      )) as { lock?: unknown } | undefined;
      return Boolean(settings?.lock);
    })
    .toBe(true);
}
