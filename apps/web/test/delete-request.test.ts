import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("api/delete-request.ts — INFRA-08 source contract", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("apps/web/src/pages/api/delete-request.ts", "utf-8");
  });

  it("recipient uses multi-niche template `privacy@${niche.domain}`", () => {
    expect(src).toMatch(/`privacy@\$\{niche\.domain\}`/);
  });

  it("does NOT hardcode `privacy@windturbinejobs.com`", () => {
    expect(src).not.toMatch(/['"`]privacy@windturbinejobs\.com['"`]/);
  });

  it("validates email regex", () => {
    expect(src).toMatch(/Please enter a valid email address/);
    expect(src).toMatch(/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\./);   // the regex literal
  });

  it("requires turnstileToken", () => {
    expect(src).toMatch(/Please complete the security check/);
  });

  it("calls verifyTurnstile and sendDeletionRequest", () => {
    expect(src).toMatch(/verifyTurnstile\(env,/);
    expect(src).toMatch(/sendDeletionRequest\(env,/);
  });

  it("returns 500 'Could not submit request' on Resend failure", () => {
    expect(src).toMatch(/Could not submit request/);
    expect(src).toMatch(/status:\s*500/);
  });

  it("returns the exact CONTEXT D-14 success message", () => {
    expect(src).toMatch(/We received your request and will process it within 30 days\./);
  });

  it("uses niche.name for fromAddress (multi-niche)", () => {
    expect(src).toMatch(/`\$\{niche\.name\} <noreply@\$\{niche\.domain\}>`/);
  });
});
