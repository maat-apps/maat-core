/// <reference types="vite/client" />
// Types for the browser-mode tests: Vite's (the stylesheet setup.ts
// imports) and the custom command registered in vitest.config.ts.
import "vitest/browser";

declare module "vitest/browser" {
  interface BrowserCommands {
    touchSwipe: (
      from: { x: number; y: number },
      to: { x: number; y: number },
      frameWidth: number,
    ) => Promise<void>;
  }
}
