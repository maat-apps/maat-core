import type { ReactNode } from "react";
import { cn } from "./cn";
import { listRowCardClass } from "./list-row-classes";

/**
 * A tappable card row for a plain (non-sortable) list. `children` is the
 * row's content, e.g. an icon or ring, a title and a trailing chevron. For
 * a drag-to-reorder list, use `SortableListRow` from `sortable-list`.
 */
export function ListRow({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        listRowCardClass,
        "active:bg-muted [&>svg]:text-muted-foreground gap-3.5 border-0 px-4 py-3.5",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
