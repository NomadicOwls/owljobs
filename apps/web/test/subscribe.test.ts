import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("api/subscribe.ts — INFRA-06 consent enforcement (source contract)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("apps/web/src/pages/api/subscribe.ts", "utf-8");
  });

  it("body type includes consent?: boolean", () => {
    expect(src).toMatch(/consent\?\s*:\s*boolean/);
  });

  it("rejects with 400 + 'Consent required.' when consent is missing/false", () => {
    // The handler should contain the literal error text
    expect(src).toMatch(/error:\s*["']Consent required\.["']/);
  });

  it("upsert object writes consent_given_at as ISO timestamp", () => {
    expect(src).toMatch(/consent_given_at:\s*new Date\(\)\.toISOString\(\)/);
  });

  it("consent check fires BEFORE Turnstile fetch (saves quota on bad submits)", () => {
    const consentIdx = src.indexOf("Consent required.");
    // Use "verifyTurnstile(" to skip the import statement and find the actual call
    const verifyIdx = src.indexOf("verifyTurnstile(");
    expect(consentIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(consentIdx).toBeLessThan(verifyIdx);
  });
});
