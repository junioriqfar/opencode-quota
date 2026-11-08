import { describe, expect, test } from "bun:test";
import { allocateIdr } from "../src/money.ts";

describe("allocateIdr", () => {
  test("splits exactly using largest remainder", () => {
    const members = [
      { userId: "owner", cost: 42.8145 },
      { userId: "friend", cost: 8.2138 },
    ];
    const result = allocateIdr(170_000, members, 51.0283);
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(170_000);
    expect(result.get("owner")!).toBeGreaterThan(result.get("friend")!);
  });

  test("handles three-way rounding", () => {
    const result = allocateIdr(
      100,
      [
        { userId: "a", cost: 1 },
        { userId: "b", cost: 1 },
        { userId: "c", cost: 1 },
      ],
      3,
    );
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(100);
    expect([...result.values()].sort((a, b) => b - a)).toEqual([34, 33, 33]);
  });

  test("returns zero when there is no usage", () => {
    const result = allocateIdr(170_000, [{ userId: "a", cost: 0 }], 0);
    expect(result.get("a")).toBe(0);
  });

  test("returns zero for a zero bill", () => {
    const result = allocateIdr(0, [{ userId: "a", cost: 10 }], 10);
    expect(result.get("a")).toBe(0);
  });
});
