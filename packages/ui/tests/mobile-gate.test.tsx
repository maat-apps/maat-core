import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileGate } from "../src/mobile-gate";

describe("MobileGate", () => {
  it("renders the app and the unsupported-viewport message side by side", () => {
    render(
      <MobileGate message="Open this on your phone">
        <p>app</p>
      </MobileGate>,
    );

    expect(screen.getByRole("main").textContent).toBe("app");
    expect(screen.getByText("Open this on your phone")).toBeTruthy();
  });
});
