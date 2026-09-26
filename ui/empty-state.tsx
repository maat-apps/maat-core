import type { ReactNode } from "react";

import { Button } from "./button";

// Generalized from routines' empty-states.tsx, which had three
// components (EmptyState, NoRoutinesToday, EmptySteps) sharing this exact
// shape but hard-coding routines' own i18n copy for each. One component,
// title/description/action all as props, covers all three call shapes:
// an action-less "nothing scheduled" message is just `action` omitted.
// `action.label` is a ReactNode (not a plain string) so callers can put an
// icon inside the button, matching routines' own `<Plus /> {t("...")}`.
/** A centered "nothing here" message, with an optional call-to-action button. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: {
    label: ReactNode;
    onClick: () => void;
    variant?: "default" | "outline";
  };
  className?: string;
}) {
  return (
    <div
      className={[
        "grid min-h-[calc(100dvh-72px-60px)] w-full -translate-y-8 content-center justify-items-center gap-4 px-4.5 py-5 text-center",
        className ?? "",
      ].join(" ")}
    >
      {title && <h2 className="font-heading m-0 text-xl">{title}</h2>}
      {description && (
        <p className="text-muted-foreground mx-0 mt-0 mb-2 max-w-70 text-sm leading-normal">
          {description}
        </p>
      )}
      {action && (
        <Button variant={action.variant ?? "default"} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
