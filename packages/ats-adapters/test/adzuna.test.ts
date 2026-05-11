import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("adzuna.ts — adapter contract (COVG-03, D-05, Pitfall 4)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("packages/ats-adapters/src/adzuna.ts", "utf-8");
  });

  it("exports fetchAllAdzunaJobs", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+fetchAllAdzunaJobs/);
  });

  it("exports AdzunaAdapterError", () => {
    expect(src).toMatch(/export\s+class\s+AdzunaAdapterError/);
  });

  it("calls api.adzuna.com/v1/api/jobs/{country}/search/{page}", () => {
    expect(src).toMatch(/api\.adzuna\.com\/v1\/api\/jobs/);
  });

  it("uses app_id + app_key query params (NOT headers)", () => {
    expect(src).toMatch(/app_id=/);
    expect(src).toMatch(/app_key=/);
  });

  it("sets description: null on adapted jobs (Pitfall 4)", () => {
    expect(src).toMatch(/description:\s*null/);
  });

  it("does not import sanitizeJobDescription (no description to sanitize)", () => {
    expect(src).not.toMatch(/sanitizeJobDescription/);
  });

  it("normalizes response.results[].redirect_url → canonicalUrl", () => {
    expect(src).toMatch(/redirect_url/);
    expect(src).toMatch(/canonicalUrl/);
  });
});
