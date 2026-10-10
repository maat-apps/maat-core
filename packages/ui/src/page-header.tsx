import type { ReactNode } from "react";

import { cn } from "./cn";

// Shared shell for a screen's sticky header. `fixed` (not `sticky`) so the
// background spans the full viewport edge to edge — a `sticky` element is
// still width-constrained by its normal-flow parent, which for a centered
// w-[min(100%,480px)] content column would leave bare page background in
// the side gutters above 480px wide. The actual content stays constrained
// to that same column via the inner wrapper below, so text/controls still
// line up with the rest of the page. Callers must add top padding to their
// own content wrapper equal to this header's rendered height (pt-27) —
// `fixed` removes it from document flow entirely, unlike `sticky`, which
// still reserves its own space. No shadow: the header's own background is
// the only edge between it and the content scrolling underneath.
export function PageHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("bg-background fixed inset-x-0 top-0 z-10", className)}
    >
      <div className="mx-auto flex h-27 w-[min(100%,480px)] items-center justify-between gap-4 px-5">
        {children}
      </div>
    </header>
  );
}
