import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackupPasswordDrawer } from "../src/backup-password-drawer";
import { passwordLabels } from "./password-labels";

function renderDrawer(
  mode: "choose" | "enter",
  onSubmit = vi.fn(async () => true),
) {
  const onOpenChange = vi.fn();
  render(
    <BackupPasswordDrawer
      mode={mode}
      open
      onOpenChange={onOpenChange}
      labels={passwordLabels}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onOpenChange };
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.spyOn(window.history, "back").mockImplementation(() => {});
});

describe("BackupPasswordDrawer choosing a password", () => {
  it("refuses one under the minimum length", async () => {
    const { onSubmit } = renderDrawer("choose");
    type("Password", "short");
    type("Repeat password", "short");

    fireEvent.click(screen.getByRole("button", { name: "Save backup" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "At least 8 characters.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses a repeat that doesn't match", async () => {
    const { onSubmit } = renderDrawer("choose");
    type("Password", "long enough");
    type("Repeat password", "long enougH");

    fireEvent.click(screen.getByRole("button", { name: "Save backup" }));

    expect(await screen.findByText("The passwords don't match.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a matching password and closes", async () => {
    const { onSubmit, onOpenChange } = renderDrawer("choose");
    type("Password", "long enough");
    type("Repeat password", "long enough");

    fireEvent.click(screen.getByRole("button", { name: "Save backup" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSubmit).toHaveBeenCalledWith("long enough");
  });
});

describe("BackupPasswordDrawer entering a password", () => {
  it("asks once, with no length rule", async () => {
    const { onSubmit } = renderDrawer("enter");
    expect(screen.queryByLabelText("Repeat password")).toBeNull();
    type("Password", "old");

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("old"));
  });

  it("stays open and says so when the password doesn't work", async () => {
    const { onOpenChange } = renderDrawer(
      "enter",
      vi.fn(async () => false),
    );
    type("Password", "wrong");

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(
      await screen.findByText("Wrong password, or the file is damaged."),
    ).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("closes on Cancel without submitting", () => {
    const { onSubmit, onOpenChange } = renderDrawer("enter");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
