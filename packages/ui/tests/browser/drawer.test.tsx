import { render } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { commands, page } from "vitest/browser";

import { Drawer, DrawerContent, DrawerTitle } from "../../src/drawer";

function OpenDrawer() {
  const [open, setOpen] = useState(true);
  return (
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      <DrawerContent>
        <DrawerTitle>Settings</DrawerTitle>
        <p style={{ height: 300 }}>Content</p>
      </DrawerContent>
    </Drawer>
  );
}

it("closes on a downward touch swipe", async () => {
  await page.viewport(390, 844);
  render(<OpenDrawer />);
  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();
  const element = dialog.element();
  // Wait for the open transition, or the gesture starts outside the
  // still-arriving popup and is never recognized.
  await Promise.all(element.getAnimations().map((a) => a.finished));

  const box = element.getBoundingClientRect();
  const x = box.left + box.width / 2;
  await commands.touchSwipe(
    { x, y: box.top + 20 },
    { x, y: box.top + 500 },
    window.innerWidth,
  );

  await expect.element(dialog).not.toBeInTheDocument();
});

function HandOver() {
  const [step, setStep] = useState<"first" | "next" | "none">("first");
  return (
    <>
      <Drawer
        open={step === "first"}
        onOpenChange={(open) => !open && setStep("none")}
      >
        <DrawerContent>
          <DrawerTitle>First</DrawerTitle>
          <button type="button" onClick={() => setStep("next")}>
            Continue
          </button>
        </DrawerContent>
      </Drawer>
      <Drawer
        open={step === "next"}
        onOpenChange={(open) => !open && setStep("none")}
      >
        <DrawerContent>
          <DrawerTitle>Next</DrawerTitle>
        </DrawerContent>
      </Drawer>
    </>
  );
}

it("keeps a drawer that takes over from a closing one open", async () => {
  render(<HandOver />);
  const lengthBefore = window.history.length;

  await page.getByRole("button", { name: "Continue" }).click();
  // Long enough for the first drawer's history.back() to land.
  await new Promise((resolve) => setTimeout(resolve, 300));

  await expect
    .element(page.getByRole("dialog", { name: "Next" }))
    .toBeVisible();
  // The first drawer's entry is gone and the next one's is on top.
  expect(window.history.length).toBe(lengthBefore);
  expect(window.history.state).toMatchObject({
    drawerMarker: expect.any(Number),
  });
});
