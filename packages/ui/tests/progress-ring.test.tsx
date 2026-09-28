import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "../src/progress-ring";

function progressArc(container: HTMLElement) {
  return container.querySelectorAll("circle")[1];
}

describe("ProgressRing", () => {
  it("exposes its label and shows the completed/total counter", () => {
    render(<ProgressRing completed={1} total={4} ariaLabel="1 of 4 done" />);

    expect(screen.getByRole("img", { name: "1 of 4 done" })).toBeTruthy();
    expect(screen.getByText("1/4")).toBeTruthy();
  });

  it("offsets the arc by the remaining percentage", () => {
    const { container } = render(
      <ProgressRing completed={1} total={4} ariaLabel="progress" />,
    );

    expect(progressArc(container).getAttribute("stroke-dashoffset")).toBe("75");
  });

  it("rounds the percentage", () => {
    const { container } = render(
      <ProgressRing completed={1} total={3} ariaLabel="progress" />,
    );

    expect(progressArc(container).getAttribute("stroke-dashoffset")).toBe("67");
  });

  it("shows an empty arc when there is nothing to complete", () => {
    const { container } = render(
      <ProgressRing completed={0} total={0} ariaLabel="progress" />,
    );

    expect(progressArc(container).getAttribute("stroke-dashoffset")).toBe(
      "100",
    );
    expect(screen.getByText("0/0").className).not.toContain("opacity-0");
  });

  it("hides the counter once complete", () => {
    render(<ProgressRing completed={4} total={4} ariaLabel="progress" />);

    expect(screen.getByText("4/4").className).toContain("opacity-0");
  });
});
