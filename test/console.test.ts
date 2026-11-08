import { describe, expect, test } from "bun:test";
import { parseCsv, parseUsageExport } from "../src/console.ts";

describe("parseCsv", () => {
  test("handles quoted commas, escaped quotes and CRLF", () => {
    const rows = parseCsv('a,b,c\r\n1,"two, three","say ""hi"""\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "two, three", 'say "hi"'],
    ]);
  });

  test("keeps empty trailing cells", () => {
    expect(parseCsv("a,b,c\n1,,\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", ""],
    ]);
  });
});

describe("parseUsageExport", () => {
  test("parses service accounts, members and quoted names", () => {
    const csv = [
      "day,user_type,user_id,user_name,provider,model,requests,input_tokens,output_tokens,cache_read_tokens,cache_write_5m_tokens,cache_write_1h_tokens,cost_micro_cents,cost_usd",
      '2026-11-08,service_account,svc_1,Example Team,opencode-go,deepseek-v4.1-flash,323,701849,230758,78703360,0,0,48265786,0.48265786',
      '2026-11-08,member,user_1,"Bob",opencode-go,gpt-6-luna,2,100,50,0,0,0,1000,0.00001',
      "invalid,row,,,,,,,,,,,,",
    ].join("\n");

    const rows = parseUsageExport(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      day: "2026-11-08",
      user_type: "service_account",
      user_id: "svc_1",
      user_name: "Example Team",
      cost_microcents: 48265786,
    });
    expect(rows[1]).toMatchObject({
      user_type: "member",
      user_id: "user_1",
      user_name: "Bob",
      cost_microcents: 1000,
    });
  });

  test("returns empty for a header-only export", () => {
    expect(parseUsageExport("day,user_type,user_id\n")).toEqual([]);
  });
});
