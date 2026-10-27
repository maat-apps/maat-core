import type { Page } from "@playwright/test";

/**
 * The value under `key` in the app's `@maat-apps/core/storage` database
 * (`undefined` when there's none). Settings and data persist in the
 * background, so poll it before a reload that should keep them:
 *
 * ```ts
 * await expect
 *   .poll(() => readStored(page, "my-app", "my-app-settings"))
 *   .toMatchObject({ relockAfter: "now" });
 * ```
 */
export function readStored(
  page: Page,
  database: string,
  key: string,
): Promise<unknown>;

/**
 * A virtual platform authenticator with the PRF extension, so the app lock
 * encrypts as on a real phone. Chromium only (DevTools protocol).
 */
export function installPrfAuthenticator(page: Page): Promise<void>;
