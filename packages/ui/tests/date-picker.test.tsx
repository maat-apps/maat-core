import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DatePicker,
  DateRangePickerInput,
  formatDateValue,
  type DateRangeValue,
} from "../src/date-picker";

const january: DateRangeValue = {
  from: new Date(2026, 0, 5),
  to: new Date(2026, 0, 9),
};
const march: DateRangeValue = {
  from: new Date(2026, 2, 10),
  to: new Date(2026, 2, 12),
};

function triggerLabel(): string {
  return screen.getByRole("button", { name: /^Stay\./ }).ariaLabel ?? "";
}

function Picker({ value, open }: { value: DateRangeValue; open: boolean }) {
  return (
    <DateRangePickerInput
      label="Stay"
      value={value}
      open={open}
      onOpenChange={() => {}}
      onValueChange={() => {}}
    />
  );
}

describe("DatePicker's year/month panel", () => {
  function YearPicker({ enabled }: { enabled: boolean }) {
    return (
      <DatePicker
        enableYearMonthPicker={enabled}
        animated={false}
        defaultMonth={new Date(2026, 0, 1)}
      />
    );
  }

  it("opens the year list from the caption", () => {
    render(<YearPicker enabled />);

    fireEvent.click(screen.getByRole("button", { name: /^Select year/ }));

    expect(screen.getByRole("listbox", { name: "Choose year" })).toBeTruthy();
  });

  it("drops an open year list when the picker is disabled and re-enabled", () => {
    const { rerender } = render(<YearPicker enabled />);
    fireEvent.click(screen.getByRole("button", { name: /^Select year/ }));

    rerender(<YearPicker enabled={false} />);
    rerender(<YearPicker enabled />);

    expect(screen.queryByRole("listbox", { name: "Choose year" })).toBeNull();
  });
});

describe("DateRangePickerInput's draft", () => {
  it("shows the value while closed", () => {
    render(<Picker value={january} open={false} />);

    expect(triggerLabel()).toContain(formatDateValue(january.from));
  });

  it("starts from the latest value when opened through the controlled prop", () => {
    const { rerender } = render(<Picker value={january} open={false} />);
    rerender(<Picker value={march} open={false} />);

    // Opening via the `open` prop bypasses the popover's own onOpenChange,
    // so the draft must already have followed the value while closed.
    rerender(<Picker value={march} open />);

    expect(triggerLabel()).toContain(formatDateValue(march.from));
    expect(triggerLabel()).not.toContain(formatDateValue(january.from));
  });
});
