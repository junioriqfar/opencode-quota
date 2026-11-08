import type { Context } from "hono";
import type { ZodSchema } from "zod";
import { badRequest, tooMany } from "./errors.ts";

export function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

export async function parseJson<T>(c: Context, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest("Invalid JSON body.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Invalid input.", parsed.error.flatten());
  }
  return parsed.data;
}

const buckets = new Map<string, { count: number; resetAt: number }>();
let lastSweep = Date.now();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    lastSweep = now;
  }
  const bucket = buckets.get(key) ?? { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > limit) throw tooMany();
}
