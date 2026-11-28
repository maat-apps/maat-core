import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import {
  SharedBackupImport,
  type SharedBackupImportLabels,
} from "../src/shared-backup-import";
import { passwordLabels } from "./password-labels";

const labels: SharedBackupImportLabels = {
  importTitle: "Add from the backup?",
  importDescription: "Nothing is deleted.",
  importConfirm: "Import",
  importFailed: "That file isn't a backup.",
  cancel: "Cancel",
  done: "Done",
};

const parse = (text: string) => {
  if (text !== "backup") throw new Error("not a backup");
  return { parsed: text };
};

const passwords = {
  isEncrypted: (text: string) => text.startsWith("locked:"),
  parseWithPassword: async (text: string, password: string) => {
    if (password !== "right password") throw new Error("no");
    return { parsed: text };
  },
  labels: passwordLabels,
};

function setup(path: string, shared: string | null) {
  const take = vi.fn(() => Promise.resolve(shared));
  const onImport = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <SharedBackupImport
            take={take}
            parse={parse}
            passwords={passwords}
            onImport={onImport}
            labels={labels}
          />
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return { take, onImport, router };
}

describe("SharedBackupImport", () => {
  it("does nothing without the marker", () => {
    const { take } = setup("/", "backup");

    expect(take).not.toHaveBeenCalled();
  });

  it("imports the shared backup once confirmed, and drops the marker", async () => {
    const { onImport, router } = setup("/?shared-backup", "backup");

    fireEvent.click(await screen.findByRole("button", { name: "Import" }));

    expect(onImport).toHaveBeenCalledWith({ parsed: "backup" });
    expect(router.state.location.search).toBe("");
  });

  it("says so when the file isn't a backup", async () => {
    const { onImport } = setup("/?shared-backup", "junk");

    expect(await screen.findByText("That file isn't a backup.")).toBeTruthy();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("asks for a protected file's password before confirming", async () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { onImport } = setup("/?shared-backup", "locked:backup");

    fireEvent.change(await screen.findByLabelText("Password"), {
      target: { value: "right password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import" }));

    expect(onImport).toHaveBeenCalledWith({ parsed: "locked:backup" });
  });

  it("asks nothing when no file was parked", async () => {
    const { take } = setup("/?shared-backup", null);

    await waitFor(() => expect(take).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
  });
});
