import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListRow } from "../src/list-row";
import {
  reorderIds,
  SortableList,
  SortableListRow,
} from "../src/sortable-list";

describe("reorderIds", () => {
  it("moves an id down to the drop target", () => {
    expect(reorderIds(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });

  it("moves an id up to the drop target", () => {
    expect(reorderIds(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("returns null when dropped in place", () => {
    expect(reorderIds(["a", "b"], "a", "a")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(reorderIds(["a", "b"], "a", "x")).toBeNull();
    expect(reorderIds(["a", "b"], "x", "a")).toBeNull();
  });

  it("doesn't mutate the input", () => {
    const ids = ["a", "b", "c"];

    reorderIds(ids, "a", "c");

    expect(ids).toEqual(["a", "b", "c"]);
  });
});

const items = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
];

function renderList(onOpen = vi.fn(), ariaLabel?: string) {
  render(
    <SortableList
      items={items}
      onReorder={() => {}}
      aria-label={ariaLabel}
      renderItem={(item) => (
        <SortableListRow
          key={item.id}
          id={item.id}
          dragLabel={`Move ${item.name}`}
          onOpen={onOpen}
        >
          {item.name}
        </SortableListRow>
      )}
    />,
  );
  return onOpen;
}

describe("SortableList + SortableListRow", () => {
  it("renders every item in order", () => {
    renderList();

    const rows = screen
      .getAllByRole("button")
      .filter((button) => button.dataset.main);
    expect(rows.map((row) => row.textContent)).toEqual(["Alpha", "Beta"]);
  });

  it("labels each row's drag handle", () => {
    renderList();

    expect(screen.getByRole("button", { name: "Move Beta" })).toBeTruthy();
  });

  it("opens a row by id when tapped", () => {
    const onOpen = renderList();

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    expect(onOpen).toHaveBeenCalledWith("b");
  });

  it("renders a labelled region only when given a label", () => {
    renderList(vi.fn(), "Clients");

    expect(screen.getByRole("region", { name: "Clients" })).toBeTruthy();
  });

  it("renders no region without a label", () => {
    renderList();

    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("ListRow", () => {
  it("calls onClick when tapped", () => {
    const onClick = vi.fn();
    render(<ListRow onClick={onClick}>Alpha</ListRow>);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
