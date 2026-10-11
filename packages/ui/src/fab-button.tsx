import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";

/** Shared shape for the floating action button: 88px, rounded as in Keep. */
export function FabButton({
  onClick,
  ariaLabel,
  className,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      size="icon-lg"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn("h-22 w-22 rounded-3xl", className)}
    >
      {children}
    </Button>
  );
}
