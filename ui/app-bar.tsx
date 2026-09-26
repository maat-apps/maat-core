import { ArrowLeft } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "./button";
import { PageHeader } from "./page-header";

// Adapted from routines' app-bar.tsx: takes `backLabel` as a prop instead
// of calling routines' own useTranslation() hook directly, since a shared
// component can't depend on one app's i18n module — the caller passes its
// own translated string.
export function AppBar({
  title,
  backLabel,
  onBack,
  action,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <PageHeader>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={backLabel}
        onClick={onBack}
      >
        <ArrowLeft className="size-6" />
      </Button>
      <h1 className="font-heading m-0 min-w-0 flex-1 overflow-hidden text-2xl font-semibold tracking-tight text-ellipsis whitespace-nowrap">
        {title}
      </h1>
      {action ?? <span className="w-10" />}
    </PageHeader>
  );
}
