import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("apps/web/src/pages/api/jobs/[id]/featured.ts — FEAT-03", () => {
  let src = "";
  beforeAll(async () => {
    try {
      src = await readFile(
        new URL("../src/pages/api/jobs/[id]/featured.ts", import.meta.url),
        "utf-8",
      );
    } catch {
      src = "";
    }
  });

  it("FEAT-03 — sets featured_until to 30 days from now", () => {
    expect(src).toMatch(/30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|30\s*\*\s*86_?400\s*\*\s*1000/);
  });

  it("FEAT-03 (T-04-11 IDOR) — checks employer_id match before UPDATE", () => {
    expect(src).toMatch(/\.eq\(\s*["']employer_id["']/);
  });

  it("FEAT-03 — multi-niche: uses niche.supabaseSchema", () => {
    expect(src).toMatch(/niche\.supabaseSchema/);
  });
});
