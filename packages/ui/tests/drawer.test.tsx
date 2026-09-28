import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Drawer, DrawerContent, DrawerTitle } from "../src/drawer";

function TestDrawer({
  open,
  onOpenChange = () => {},
  title = "Drawer",
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerTitle>{title}</DrawerTitle>
      </DrawerContent>
    </Drawer>
  );
}

function currentMarker(): number | undefined {
  return (window.history.state as { drawerMarker?: number } | null)
    ?.drawerMarker;
}

function firePopState(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

describe("Drawer's native-back dismissal", () => {
  let back: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState(null, "");
    // jsdom's back() navigates asynchronously; the hook's own contract is
    // only *whether* it calls back(), so stub it.
    back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  });

  it("pushes a marked history entry when opened", () => {
    const lengthBefore = window.history.length;

    render(<TestDrawer open />);

    expect(window.history.length).toBe(lengthBefore + 1);
    expect(currentMarker()).toEqual(expect.any(Number));
  });

  it("pushes nothing while closed", () => {
    const lengthBefore = window.history.length;

    render(<TestDrawer open={false} />);

    expect(window.history.length).toBe(lengthBefore);
    expect(currentMarker()).toBeUndefined();
  });

  it("closes when the back navigation leaves its entry", () => {
    const onOpenChange = vi.fn();
    render(<TestDrawer open onOpenChange={onOpenChange} />);

    firePopState(null);

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("consumes its own entry when closed another way", () => {
    const { rerender } = render(<TestDrawer open />);

    rerender(<TestDrawer open={false} />);

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("leaves history alone when something navigated on top of its entry", () => {
    const { rerender } = render(<TestDrawer open />);
    window.history.pushState({ page: "elsewhere" }, "");

    rerender(<TestDrawer open={false} />);

    expect(back).not.toHaveBeenCalled();
  });

  it("doesn't call back() again after a back navigation closed it", () => {
    const { rerender } = render(<TestDrawer open />);
    firePopState(null);

    rerender(<TestDrawer open={false} />);

    expect(back).not.toHaveBeenCalled();
  });

  it("closes only the topmost of nested drawers", () => {
    const onParentChange = vi.fn();
    const onChildChange = vi.fn();
    const { rerender } = render(
      <TestDrawer open title="Parent" onOpenChange={onParentChange} />,
    );
    const parentState = window.history.state;
    rerender(
      <>
        <TestDrawer open title="Parent" onOpenChange={onParentChange} />
        <TestDrawer open title="Child" onOpenChange={onChildChange} />
      </>,
    );

    // Back from the child's entry lands on the parent's.
    firePopState(parentState);

    expect(onChildChange).toHaveBeenCalledWith(false, expect.anything());
    expect(onParentChange).not.toHaveBeenCalled();
  });
});
