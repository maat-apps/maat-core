import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";

/**
 * Shared shape for a secondary destructive/reset-style action button. The
 * disabled blurred-background look itself lives on the base Button's
 * outline variant — every outline button gets it, not just this one — so
 * this component only adds the size/shape.
 */
export function ResetButton({
  disabled,
  onClick,
  className,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={cn("min-h-13 rounded-lg px-4.5", className)}
    >
      {children}
    </Button>
  );
}
