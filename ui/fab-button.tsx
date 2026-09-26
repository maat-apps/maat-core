import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "@/lib/utils";

/** Shared shape for a floating circular/square action button. */
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
      className={cn("h-13 w-13 rounded-lg", className)}
    >
      {children}
    </Button>
  );
}
