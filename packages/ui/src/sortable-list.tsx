import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";
import { DragHandle } from "./drag-handle";
import { listRowCardClass, listRowContentClass } from "./list-row-classes";

/**
 * Pointer, touch and keyboard sensors for a drag-to-reorder list. The touch
 * delay keeps a vertical swipe scrolling the page instead of picking a row
 * up; the pointer distance keeps a plain click a click.
 */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}

/**
 * `ids` with `activeId` moved to `overId`'s position, or `null` when nothing
 * moves (dropped in place, or either id unknown).
 */
export function reorderIds(
  ids: string[],
  activeId: string,
  overId: string,
): string[] | null {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return null;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * A vertical drag-to-reorder list. Rows are rendered by `renderItem` and must
 * be sortable themselves — `SortableListRow`, or any component built on
 * `useSortableItem`. Reports the new order as ids; the caller owns the data.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  className,
  "aria-label": ariaLabel,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  /** When set, the list renders as a labelled `<section>`. */
  "aria-label"?: string;
}) {
  const sensors = useDragSensors();
  const ids = items.map((item) => item.id);
  const Container = ariaLabel ? "section" : "div";

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const next = reorderIds(ids, String(active.id), String(over.id));
    if (next) onReorder(next);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <Container
          className={cn("grid grid-cols-[minmax(0,1fr)]", className)}
          aria-label={ariaLabel}
        >
          {items.map((item, index) => renderItem(item, index))}
        </Container>
      </SortableContext>
    </DndContext>
  );
}

/**
 * The sortable wiring for one row inside a `SortableList`: spread `style`
 * and `setNodeRef` on the row element, and pass `attributes`/`listeners` to
 * its `DragHandle`.
 */
export function useSortableItem(id: string) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return { attributes, listeners, setNodeRef, style, isDragging };
}

/**
 * `ListRow` with a drag handle, for use inside `SortableList`. Tapping the
 * row calls `onOpen(id)`; dragging the handle reorders.
 */
export function SortableListRow({
  id,
  dragLabel,
  onOpen,
  className,
  children,
}: {
  id: string;
  dragLabel: string;
  onOpen: (id: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } =
    useSortableItem(id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        listRowCardClass,
        "has-[[data-main]:active]:bg-muted gap-0 py-0 pr-4 pl-2",
        isDragging && "relative z-1 shadow-[0_8px_20px_oklch(0_0_0/20%)]",
        className,
      )}
    >
      <DragHandle
        className="text-muted-foreground flex-none"
        dragLabel={dragLabel}
        attributes={attributes}
        listeners={listeners}
      />
      <button
        type="button"
        data-main="true"
        className={cn(listRowContentClass, "pr-0 pl-2")}
        onClick={() => onOpen(id)}
      >
        {children}
      </button>
    </div>
  );
}
