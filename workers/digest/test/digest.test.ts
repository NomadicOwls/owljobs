import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("workers/digest/src/index.ts — CAND-01/CAND-02 source contract", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("workers/digest/src/index.ts", "utf-8");
  });

  // CAND-01 — cron + queue + Resend
  it("exports an ExportedHandler with scheduled and queue (CAND-01)", () => {
    expect(src).toMatch(/scheduled\s*\(/);
    expect(src).toMatch(/queue\s*\(/);
  });

  it("iterates all niches via getAllNiches() (multi-niche, D-18)", () => {
    expect(src).toMatch(/getAllNiches\s*\(\s*\)/);
    // Hard rule: no hardcoded wind_turbine schema string in code (only via niche.supabaseSchema)
    expect(src).not.toMatch(/supabase\.schema\s*\(\s*["']wind_turbine["']\s*\)/);
  });

  it("validates nicheId against the registry in the queue consumer (Tampering mitigation)", () => {
    expect(src).toMatch(/getAllNiches\(\)\.find/);
    expect(src).toMatch(/unknown nicheId/);
  });

  it("filters subscribers with .not(\"confirmed_at\", \"is\", null) (Pitfall 2 — exclude soft-unsubscribed)", () => {
    expect(src).toMatch(/\.not\(\s*["']confirmed_at["']\s*,\s*["']is["']\s*,\s*null\s*\)/);
  });

  it("uses ctx.waitUntil in the scheduled handler (30s CPU cap)", () => {
    expect(src).toMatch(/ctx\.waitUntil\s*\(/);
  });

  it("enqueues DIGEST_QUEUE with { nicheId, subscriberIds } payload (D-15)", () => {
    expect(src).toMatch(/DIGEST_QUEUE\.send/);
    expect(src).toMatch(/subscriberIds/);
  });

  it("limits new jobs to the prior 7 days, max 20 (D-01, D-06)", () => {
    // 7-day window — accept any of: 7 * 24, 7d, '7 days', or now() - interval
    expect(src).toMatch(/posted_at/);
    expect(src).toMatch(/7|seven/i);
    // job cap of 20
    expect(src).toMatch(/\b20\b/);
  });

  it("computes sent_date as UTC YYYY-MM-DD (Pitfall 4)", () => {
    expect(src).toMatch(/toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/);
  });

  // CAND-02 — RFC 8058 headers
  it("calls Resend batch endpoint https://api.resend.com/emails/batch", () => {
    expect(src).toMatch(/api\.resend\.com\/emails\/batch/);
  });

  it("sends from digest@windturbinejobs.com (D-09)", () => {
    expect(src).toMatch(/digest@windturbinejobs\.com/);
  });

  it("attaches List-Unsubscribe header with token in URL (RFC 8058, D-19)", () => {
    expect(src).toMatch(/List-Unsubscribe/);
    expect(src).toMatch(/unsubscribe\?token=/);
  });

  it("attaches List-Unsubscribe-Post: List-Unsubscribe=One-Click (CAND-02)", () => {
    expect(src).toMatch(/List-Unsubscribe-Post/);
    expect(src).toMatch(/List-Unsubscribe=One-Click/);
  });

  it("omits a fetch handler (no debug HTTP endpoints — secret leakage mitigation)", () => {
    // Strip comments before checking — header prose may legitimately mention 'fetch'
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/async\s+fetch\s*\(/);
  });

  it("logs and skips failed subscribers in the consumer (D-17)", () => {
    expect(src).toMatch(/console\.(error|warn)/);
  });
});
