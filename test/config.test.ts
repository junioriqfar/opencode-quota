import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const configPath = resolve(import.meta.dir, "../src/config.ts");
const emptyDir = mkdtempSync(join(tmpdir(), "quota-config-"));

const baseEnv = {
  PATH: process.env.PATH ?? "",
  NODE_ENV: "production",
  SESSION_SECRET: "test-session-secret",
  APP_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

function loadConfig(env: Record<string, string>) {
  return Bun.spawnSync({
    cmd: [process.execPath, "-e", `await import(${JSON.stringify(configPath)})`],
    cwd: emptyDir,
    env: { ...baseEnv, ...env },
    stderr: "pipe",
    stdout: "pipe",
  });
}

describe("production config guardrails", () => {
  test("requires DATABASE_URL", () => {
    const result = loadConfig({ APP_URL: "https://quota.example.com" });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("DATABASE_URL is required in production");
  });

  test("rejects a non-https APP_URL", () => {
    const result = loadConfig({
      APP_URL: "http://quota.example.com",
      DATABASE_URL: "postgres://quota_app:x@127.0.0.1:5432/opencode_quota",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("APP_URL must be an https:// URL in production");
  });

  test("accepts a complete production configuration", () => {
    const result = loadConfig({
      APP_URL: "https://quota.example.com",
      DATABASE_URL: "postgres://quota_app:x@127.0.0.1:5432/opencode_quota",
    });
    expect(result.exitCode).toBe(0);
  });
});
