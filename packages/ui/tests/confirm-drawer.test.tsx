import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDrawer } from "../src/confirm-drawer";

function renderConfirmDrawer() {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDrawer
      open
      onOpenChange={onOpenChange}
      title="Delete routine?"
      description="This can't be undone."
      cancelLabel="Cancel"
      confirmLabel="Delete"
      onConfirm={onConfirm}
    />,
  );
  return { onOpenChange, onConfirm };
}

describe("ConfirmDrawer", () => {
  beforeEach(() => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
  });

  it("shows the title and description", () => {
    renderConfirmDrawer();

    expect(screen.getByText("Delete routine?")).toBeTruthy();
    expect(screen.getByText("This can't be undone.")).toBeTruthy();
  });

  it("closes without confirming on Cancel", () => {
    const { onOpenChange, onConfirm } = renderConfirmDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms on the destructive button", () => {
    const { onConfirm } = renderConfirmDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
