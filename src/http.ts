import type { Context } from "hono";
import type { ZodSchema } from "zod";
import { badRequest, tooMany } from "./errors.ts";
import { sql } from "./db.ts";

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

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const resetAt = new Date(Date.now() + Math.max(1, windowMs));
  const rows = await sql<{ count: number }[]>`
    insert into rate_limits(key, count, reset_at)
    values (${key}, 1, ${resetAt})
    on conflict (key) do update set
      count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at <= now() then ${resetAt} else rate_limits.reset_at end
    returning count
  `;
  if (Number(rows[0]?.count ?? 0) > limit) throw tooMany();
}
