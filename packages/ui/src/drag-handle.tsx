import type { useSortable } from "@dnd-kit/sortable";
import { DotsSixVertical } from "@phosphor-icons/react";

import { Button } from "./button";
import { cn } from "./cn";

/** The grab handle every drag-to-reorder row uses. */
export function DragHandle({
  dragLabel,
  className,
  attributes,
  listeners,
}: {
  dragLabel: string;
  className?: string;
} & Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">) {
  return (
    <Button
      className={cn("cursor-grab touch-none active:cursor-grabbing", className)}
      variant="ghost"
      size="icon-sm"
      aria-label={dragLabel}
      {...attributes}
      {...listeners}
    >
      <DotsSixVertical aria-hidden="true" />
    </Button>
  );
}
