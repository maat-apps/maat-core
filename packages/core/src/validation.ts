import * as v from "valibot";

// Lenient parsing for data crossing a trust boundary (stored data read back,
// a user-supplied backup file): every array/record entry is validated on its
// own and malformed ones are dropped, so one bad entry doesn't take the rest
// down with it — which is what v.array()/v.record() do on a single failure.
// See maat-core STRUCTURE.md's Conventions.

/** A plain object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The entries of `value` that match `schema`, in order. Anything that isn't
 * an array yields `[]`.
 */
export function parseEach<T>(
  schema: v.GenericSchema<unknown, T>,
  value: unknown,
): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => v.safeParse(schema, item))
    .filter((result) => result.success)
    .map((result) => result.output);
}

/**
 * The entries of the record `value` whose values match `schema`, keyed as
 * before. Anything that isn't a plain object yields `{}`.
 */
export function parseRecordEach<T>(
  schema: v.GenericSchema<unknown, T>,
  value: unknown,
): Record<string, T> {
  if (!isRecord(value)) return {};
  const result: Record<string, T> = {};
  for (const [key, entry] of Object.entries(value)) {
    const parsed = v.safeParse(schema, entry);
    if (parsed.success) result[key] = parsed.output;
  }
  return result;
}
