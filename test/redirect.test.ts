import { describe, expect, test } from "bun:test";
import { safeNextPath } from "../shared/redirect.ts";

describe("safeNextPath", () => {
  test("keeps internal paths", () => {
    expect(safeNextPath("/invite/abc123")).toBe("/invite/abc123");
    expect(safeNextPath("  /app/g/1  ")).toBe("/app/g/1");
  });

  test("rejects external or protocol-relative targets", () => {
    expect(safeNextPath("https://evil.example")).toBeUndefined();
    expect(safeNextPath("//evil.example")).toBeUndefined();
    expect(safeNextPath("/\\evil.example")).toBeUndefined();
  });

  test("rejects empty and control-character payloads", () => {
    expect(safeNextPath("")).toBeUndefined();
    expect(safeNextPath(null)).toBeUndefined();
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath("/app\n/set-cookie")).toBeUndefined();
  });

  test("rejects overly long values", () => {
    expect(safeNextPath(`/${"a".repeat(2048)}`)).toBeUndefined();
  });
});
