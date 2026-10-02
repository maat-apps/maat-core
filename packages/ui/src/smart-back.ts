import { useLocation, useNavigate } from "react-router";

/**
 * A "Back" action that pops real history when this screen was actually
 * pushed onto it, and replaces to `fallback` when it wasn't — every route
 * is also a valid deep link (hard refresh, PWA relaunch, a bookmarked
 * URL), and on a fresh document load there's nothing of the app's own
 * behind it in session history, so popping blindly would leave the app
 * instead of landing on a sensible screen. React Router marks that case
 * with the location key "default"; anything else is a real in-app push
 * with a real entry behind it, safe to pop with `navigate(-1)`.
 *
 * Pair it with `navigate(to, { replace: true })` after a save, so a form
 * doesn't stay behind the screen it led to.
 */
export function useSmartBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key === "default") {
      void navigate(fallback, { replace: true });
    } else {
      void navigate(-1);
    }
  };
}
