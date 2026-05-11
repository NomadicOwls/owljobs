import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("smartrecruiters.ts — adapter contract (COVG-02, D-09, Pitfall 3)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("packages/ats-adapters/src/smartrecruiters.ts", "utf-8");
  });

  it("exports fetchAllSmartRecruitersJobs", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+fetchAllSmartRecruitersJobs/);
  });

  it("exports SmartRecruitersAdapterError class", () => {
    expect(src).toMatch(/export\s+class\s+SmartRecruitersAdapterError/);
  });

  it("calls the public Postings list endpoint with status=PUBLIC", () => {
    expect(src).toMatch(/api\.smartrecruiters\.com\/v1\/companies\/[\$\{][^}]+\}\/postings/);
    expect(src).toMatch(/status=PUBLIC/);
  });

  it("paginates via offset + limit", () => {
    expect(src).toMatch(/offset/);
    expect(src).toMatch(/limit/);
  });

  it("sets description: null for all returned jobs (Pitfall 3 — lazy fetch)", () => {
    expect(src).toMatch(/description:\s*null/);
  });

  it("returns AdaptedJob shape (title, canonicalUrl, sourceId, etc.)", () => {
    expect(src).toMatch(/sourceId/);
    expect(src).toMatch(/canonicalUrl/);
    expect(src).toMatch(/title/);
  });

  it("imports sha256Hex from @owljobs/schema for sourceId", () => {
    expect(src).toMatch(/import\s*\{[^}]*sha256Hex[^}]*\}\s*from\s*["']@owljobs\/schema["']/);
  });

  it("does NOT include detail-endpoint fetch in list adapter (lazy)", () => {
    // Detail endpoint is in fetch-description.ts (Plan 04) — list must not duplicate
    // Allow the URL prefix but disallow `/postings/{` followed by an `id` interpolation
    expect(src).not.toMatch(/api\.smartrecruiters\.com\/v1\/companies\/[\$\{][^}]+\}\/postings\/[\$\{]/);
  });
});
