import { type ReactNode } from "react";

// Adapted from routines' mobile-gate.tsx: takes `message` as a prop instead
// of calling routines' own useTranslation() hook directly, and drops the
// service-worker registration + navigator.storage.persist() side effects
// that lived in routines' version — those are per-app setup (SW path,
// build-mode guard, etc.), not part of the gate shape itself. A consuming
// app registers its own service worker separately, e.g. in its own root
// component's mount effect.
/** Renders `children` for phone-sized viewports, a message otherwise. */
export function MobileGate({
  children,
  message,
}: {
  children: ReactNode;
  message: string;
}) {
  return (
    <>
      <main className="bg-background phone-sized:block hidden min-h-dvh">
        {children}
      </main>
      <section
        className="bg-background text-muted-foreground phone-sized:hidden grid min-h-dvh place-items-center p-8 text-center"
        aria-live="polite"
      >
        <p>{message}</p>
      </section>
    </>
  );
}
