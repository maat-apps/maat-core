import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import {
  SharedBackupImport,
  type SharedBackupImportLabels,
} from "../src/shared-backup-import";

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

  it("asks nothing when no file was parked", async () => {
    const { take } = setup("/?shared-backup", null);

    await waitFor(() => expect(take).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
  });
});
