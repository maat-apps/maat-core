import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BottomBar,
  BottomBarButton,
  BottomBarChip,
  BottomBarChips,
} from "../src/bottom-bar";

describe("BottomBar", () => {
  it("puts settings first, the controls in the middle and the action last", () => {
    render(
      <BottomBar
        settings={
          <BottomBarButton label="Settings" onClick={() => {}}>
            ⚙
          </BottomBarButton>
        }
        action={
          <BottomBarButton label="Add" variant="primary" onClick={() => {}}>
            +
          </BottomBarButton>
        }
      >
        <BottomBarButton label="Reset" onClick={() => {}}>
          ↺
        </BottomBarButton>
      </BottomBar>,
    );

    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Settings", "Reset", "Add"]);
  });

  it("renders the row above before the main row", () => {
    render(
      <BottomBar above={<span>sort</span>} settings={<span>settings</span>} />,
    );

    const bar = document.querySelector("[data-slot=bottom-bar]");
    expect(bar?.textContent).toBe("sortsettings");
  });

  it("reserves its own space in the page", () => {
    render(<BottomBar settings={<span>settings</span>} />);

    expect(
      document.querySelector("[data-slot=bottom-bar-spacer]"),
    ).toBeTruthy();
  });
});

describe("BottomBarChips", () => {
  it("groups the chips under a label, the chosen one pressed", () => {
    const onClick = vi.fn();
    render(
      <BottomBarChips label="Plans">
        <BottomBarChip pressed onClick={() => {}}>
          A
        </BottomBarChip>
        <BottomBarChip pressed={false} onClick={onClick}>
          B
        </BottomBarChip>
      </BottomBarChips>,
    );

    expect(screen.getByRole("group", { name: "Plans" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "A" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
