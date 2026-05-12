import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("api/unsubscribe.ts — CAND-02 soft-delete + RFC 8058 source contract", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("apps/web/src/pages/api/unsubscribe.ts", "utf-8");
  });

  it("exports a GET handler (existing email-link flow)", () => {
    expect(src).toMatch(/export\s+const\s+GET\s*:\s*APIRoute/);
  });

  it("exports a POST handler (RFC 8058 one-click)", () => {
    expect(src).toMatch(/export\s+const\s+POST\s*:\s*APIRoute/);
  });

  it("both handlers soft-delete via .update({ confirmed_at: null }) — preserves FK integrity from email_sends (RESEARCH Conflict 4)", () => {
    const matches = src.match(/\.update\(\s*\{\s*confirmed_at\s*:\s*null\s*\}\s*\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT hard-delete anywhere (no .delete() calls)", () => {
    // Strip comments before checking; documentation may legitimately mention `.delete()`
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/\.delete\s*\(/);
  });

  it("reads token from url.searchParams in both handlers (RFC 8058 — token in URL, NOT body)", () => {
    const matches = src.match(/url\.searchParams\.get\(\s*["']token["']\s*\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("POST returns 200 OK regardless of token match — no enumeration side-channel (T-03-01)", () => {
    // POST handler must end with `return new Response("OK", { status: 200 })` (no branch on row not found)
    const postBlockMatch = src.match(/export\s+const\s+POST\s*:\s*APIRoute[\s\S]*?\n\}\s*;?\s*$/m);
    expect(postBlockMatch).not.toBeNull();
    const postBlock = postBlockMatch![0];
    expect(postBlock).toMatch(/return\s+new\s+Response\(\s*["']OK["']\s*,\s*\{\s*status:\s*200\s*\}\s*\)/);
  });

  it("does NOT reference a separate /unsubscribe-oneclick route (modify in place — RESEARCH Conflict 2)", () => {
    expect(src).not.toMatch(/unsubscribe-oneclick/);
  });

  it("uses the niche-scoped schema (multi-niche)", () => {
    const matches = src.match(/\.schema\(\s*niche\.supabaseSchema\s*\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
