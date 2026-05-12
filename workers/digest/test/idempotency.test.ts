import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("workers/digest/src/index.ts — CAND-03 idempotency source contract", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("workers/digest/src/index.ts", "utf-8");
  });

  it("inserts into email_sends BEFORE adding the email to the Resend batch (insert-before-send, Pitfall 1)", () => {
    // Strip comments to avoid matching documentation prose
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const insertIdx = code.search(/\.from\(\s*["']email_sends["']\s*\)\s*\.insert/);
    const batchIdx  = code.search(/api\.resend\.com\/emails\/batch/);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(batchIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeLessThan(batchIdx);
  });

  it("writes sent_date + type='digest' in the email_sends insert payload (D-16)", () => {
    expect(src).toMatch(/sent_date/);
    expect(src).toMatch(/type\s*:\s*["']digest["']/);
  });

  it("catches Postgres unique-violation code 23505 and skips (continue) rather than throwing", () => {
    expect(src).toMatch(/23505/);
    // Skip path must NOT throw — accept either `continue` or an explicit early return inside the loop
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/23505[\s\S]{0,200}(continue|return)/);
  });

  it("uses the niche-scoped schema for the email_sends insert (no hardcoded wind_turbine)", () => {
    // Insert must go through db = supabase.schema(niche.supabaseSchema)
    expect(src).toMatch(/supabase\.schema\(\s*niche\.supabaseSchema\s*\)/);
    expect(src).not.toMatch(/\.schema\(\s*["']wind_turbine["']\s*\)/);
  });
});
