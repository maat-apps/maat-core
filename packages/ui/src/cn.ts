import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Internal to this package — a consuming app's own @/lib/utils re-exports
// this same pattern, but a published package can't rely on a consumer's
// path alias, so this copy is the one every component here imports from.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
