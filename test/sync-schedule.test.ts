import { describe, expect, test } from "bun:test";
import { msUntilNextInterval } from "../src/sync.ts";

const TEN_MINUTES = 10 * 60_000;

function at(hours: number, minutes: number, seconds = 0, ms = 0): Date {
  return new Date(2026, 10, 10, hours, minutes, seconds, ms);
}

describe("msUntilNextInterval", () => {
  test("aligns a 10-minute schedule to wall-clock boundaries", () => {
    expect(msUntilNextInterval(TEN_MINUTES, at(9, 3, 20))).toBe(6 * 60_000 + 40_000);
    expect(msUntilNextInterval(TEN_MINUTES, at(9, 9, 59, 500))).toBe(500);
  });

  test("returns a full interval when already on a boundary", () => {
    expect(msUntilNextInterval(TEN_MINUTES, at(9, 0, 0))).toBe(TEN_MINUTES);
  });

  test("supports sub-hour intervals", () => {
    expect(msUntilNextInterval(60_000, at(9, 0, 30))).toBe(30_000);
  });
});
