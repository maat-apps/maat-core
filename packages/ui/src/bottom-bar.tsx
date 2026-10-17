import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { Button } from "./button";
import { cn } from "./cn";

// A home view's controls, all within the thumb's reach (maat-core
// STRUCTURE.md's UI stack): settings on the left of the main row, the
// view's own controls in the middle, its primary action on the right, and
// an optional row above for less-used controls. Extracted from albums' and
// gym-charts' home views. Like PageHeader it is `fixed`, so the background
// spans the viewport edge to edge while the content keeps to the 480px
// column. Unlike PageHeader it reserves its own space: an in-flow spacer
// as tall as the bar (safe area included), so content scrolls out from
// under it without the caller hard-coding the bar's height.
export function BottomBar({
  settings,
  action,
  children,
  above,
  className,
}: {
  settings?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  above?: ReactNode;
  className?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  // Layout effect, so the first paint already has the space reserved.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    setHeight(bar.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(bar.offsetHeight));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        aria-hidden="true"
        data-slot="bottom-bar-spacer"
        className="shrink-0"
        style={{ height }}
      />
      <div
        ref={barRef}
        data-slot="bottom-bar"
        className={cn(
          "bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur",
          className,
        )}
      >
        <div className="mx-auto grid w-[min(100%,480px)] grid-cols-[minmax(0,1fr)] gap-2 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {above && <div className="flex items-center gap-1">{above}</div>}
          <div className="flex items-center gap-1">
            {settings}
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {children}
            </div>
            {action}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * A 56×56 icon button for the bar: `ghost` for settings, refresh, sort;
 * `primary` for the view's main action (add).
 */
export function BottomBarButton({
  label,
  onClick,
  disabled,
  variant = "ghost",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "ghost" | "primary";
  children: ReactNode;
}) {
  return (
    <Button
      variant={variant === "primary" ? "default" : "ghost"}
      size="icon-lg"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "size-14 shrink-0",
        variant === "primary"
          ? "rounded-2xl [&_svg:not([class*='size-'])]:size-7"
          : "[&_svg:not([class*='size-'])]:size-6",
      )}
    >
      {children}
    </Button>
  );
}

/**
 * A labelled group of chips (filters, plans) that scrolls sideways, faded
 * at the right edge so a cut-off chip reads as "more this way".
 */
export function BottomBarChips({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex min-w-0 flex-1 [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] pr-6"
    >
      {children}
    </div>
  );
}

/** One 56px chip in a `BottomBarChips` group; filled while `pressed`. */
export function BottomBarChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      onClick={onClick}
      className="h-14 shrink-0 rounded-2xl px-4 text-base"
    >
      {children}
    </Button>
  );
}
