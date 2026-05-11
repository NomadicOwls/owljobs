import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("workers/ingest/src/index.ts — debug endpoint auth (CR-01)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("workers/ingest/src/index.ts", "utf-8");
  });

  it("Env interface declares INGEST_SECRET as required (no ?)", () => {
    // Must be in the Env interface block as a required field (no optional marker)
    const envStart = src.indexOf("export interface Env {");
    expect(envStart).toBeGreaterThan(-1);
    const envBlock = src.slice(envStart, src.indexOf("}", envStart) + 1);
    expect(envBlock).toMatch(/INGEST_SECRET/);
    // Optional typing (INGEST_SECRET?: string) creates a Bearer-undefined bypass — must be required
    expect(envBlock).not.toMatch(/INGEST_SECRET\?/);
  });

  const debugEndpoints = [
    "/classify-now",
    "/ingest-now",
    "/reclassify-ambiguous",
    "/enrich-now",
  ];

  for (const endpoint of debugEndpoints) {
    it(`${endpoint} branch contains INGEST_SECRET auth check`, () => {
      const branchStart = src.indexOf(`url.pathname === "${endpoint}"`);
      expect(branchStart, `Branch for ${endpoint} not found`).toBeGreaterThan(-1);
      // Extract from the pathname check to the next pathname check or end of fetch
      const nextBranch = src.indexOf("url.pathname ===", branchStart + endpoint.length + 10);
      const endIdx = nextBranch === -1 ? branchStart + 1500 : nextBranch;
      const branchBody = src.slice(branchStart, endIdx);
      expect(branchBody, `${endpoint} must check INGEST_SECRET`).toMatch(/INGEST_SECRET/);
      expect(branchBody, `${endpoint} must return 401 on auth failure`).toMatch(/401/);
    });
  }

  it("/jobs.json branch does NOT require INGEST_SECRET auth (public endpoint)", () => {
    const jobsJsonStart = src.indexOf('url.pathname !== "/jobs.json"');
    // /jobs.json is the fallback — find the section AFTER all debug endpoint checks
    // The jobs.json section starts around the `if (url.pathname !== "/jobs.json")` guard
    expect(jobsJsonStart).toBeGreaterThan(-1);
    // The /jobs.json branch must NOT reference INGEST_SECRET
    const jobsBlock = src.slice(jobsJsonStart, jobsJsonStart + 1000);
    expect(jobsBlock).not.toMatch(/INGEST_SECRET/);
  });

  it("auth guard uses Bearer token comparison (matches discover worker pattern)", () => {
    // Must check Authorization header and compare to `Bearer ${env.INGEST_SECRET}`
    expect(src).toMatch(/Authorization/);
    expect(src).toMatch(/Bearer.*INGEST_SECRET|INGEST_SECRET.*Bearer/);
  });

  it("scheduled() cron handler does NOT reference INGEST_SECRET (no auth for cron)", () => {
    const cronStart = src.indexOf("async scheduled(");
    expect(cronStart).toBeGreaterThan(-1);
    const queueStart = src.indexOf("async queue(");
    const cronBody = src.slice(cronStart, queueStart === -1 ? cronStart + 2000 : queueStart);
    expect(cronBody).not.toMatch(/INGEST_SECRET/);
  });
});
