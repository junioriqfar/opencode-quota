import { describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret, hashToken, randomToken } from "../src/crypto.ts";

describe("console key encryption", () => {
  test("round-trips a key with its group AAD", () => {
    const secret = "test-console-key-not-real";
    const encrypted = encryptSecret(secret, "group-a");
    expect(encrypted.ciphertext).not.toContain(secret);
    expect(decryptSecret(encrypted, "group-a")).toBe(secret);
  });

  test("rejects ciphertext moved to another group", () => {
    const encrypted = encryptSecret("test-console-key-not-real", "group-a");
    expect(() => decryptSecret(encrypted, "group-b")).toThrow();
  });

  test("uses random IVs", () => {
    const first = encryptSecret("same", "group-a");
    const second = encryptSecret("same", "group-a");
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  test("hashes tokens deterministically", () => {
    const token = randomToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
  });
});
