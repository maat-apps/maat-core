import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { isRecord, parseEach, parseRecordEach } from "../src/validation";

const Item = v.object({ id: v.string(), count: v.number() });

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});

describe("parseEach", () => {
  it("keeps valid entries, in order, and drops malformed ones", () => {
    const result = parseEach(Item, [
      { id: "a", count: 1 },
      { id: "b", count: "two" },
      "junk",
      { id: "c", count: 3 },
    ]);

    expect(result).toEqual([
      { id: "a", count: 1 },
      { id: "c", count: 3 },
    ]);
  });

  it("returns [] for anything that isn't an array", () => {
    expect(parseEach(Item, { id: "a", count: 1 })).toEqual([]);
    expect(parseEach(Item, undefined)).toEqual([]);
  });

  it("returns the schema's output, not the raw input", () => {
    const Trimmed = v.pipe(v.string(), v.trim());

    expect(parseEach(Trimmed, ["  a  "])).toEqual(["a"]);
  });
});

describe("parseRecordEach", () => {
  it("keeps valid entries under their keys and drops malformed ones", () => {
    const result = parseRecordEach(Item, {
      one: { id: "a", count: 1 },
      two: { id: "b" },
    });

    expect(result).toEqual({ one: { id: "a", count: 1 } });
  });

  it("returns {} for anything that isn't a plain object", () => {
    expect(parseRecordEach(Item, [{ id: "a", count: 1 }])).toEqual({});
    expect(parseRecordEach(Item, null)).toEqual({});
  });
});
