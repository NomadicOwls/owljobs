import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("expire.ts — expiry pings use buildPublicUrl (CR-02 / SEO-03 fix)", () => {
  let expireSrc = "";
  let ingestSrc = "";
  beforeAll(async () => {
    expireSrc = await readFile("workers/ingest/src/expire.ts", "utf-8");
    ingestSrc = await readFile("workers/ingest/src/ingest.ts", "utf-8");
  });

  it("expire.ts imports buildPublicUrl from ./build-public-url (WR-06 extraction)", () => {
    expect(expireSrc).toMatch(/import\s*\{[^}]*buildPublicUrl[^}]*\}\s*from\s*["']\.\/build-public-url/);
  });

  it("expire.ts imports NicheConfig (needed for niche parameter)", () => {
    expect(expireSrc).toMatch(/import\s+type\s*\{[^}]*NicheConfig[^}]*\}/);
  });

  it("expireMissingJobs signature includes niche parameter", () => {
    const fnStart = expireSrc.indexOf("export async function expireMissingJobs");
    expect(fnStart).toBeGreaterThan(-1);
    // Extract the parameter list
    const paramBlock = expireSrc.slice(fnStart, fnStart + 400);
    expect(paramBlock).toMatch(/niche\s*:\s*NicheConfig/);
  });

  it("expireMissingJobs calls pingUrlUpdated with buildPublicUrl (NOT canonical_url)", () => {
    const calls = expireSrc.match(/pingUrlUpdated\s*\([\s\S]{0,200}?\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call, "expiry ping must use buildPublicUrl, not canonical_url").toMatch(/buildPublicUrl/);
      expect(call, "expiry ping must NOT use canonical_url directly").not.toMatch(/canonical_url/);
    }
  });

  it("expire.ts does NOT reference job.canonical_url in any ping call", () => {
    // The select still fetches canonical_url (for the query) but the PING call must not use it
    const pingCalls = expireSrc.match(/pingUrlUpdated[\s\S]*?(?=\n\s*(?:if|const|let|var|for|try|catch|}))/g) ?? [];
    for (const call of pingCalls) {
      expect(call).not.toMatch(/canonical_url/);
    }
  });

  it("ingest.ts passes niche as 5th arg to expireMissingJobs (all 7 native call sites)", () => {
    // Find all expireMissingJobs call sites — Adzuna and JSearch intentionally omit it (Pitfall 1)
    const callPattern = /expireMissingJobs\s*\([\s\S]*?\)/g;
    const calls = ingestSrc.match(callPattern) ?? [];
    // All present calls (7 native ATS adapters) must pass niche
    expect(calls.length).toBeGreaterThanOrEqual(7);
    for (const call of calls) {
      expect(call, `expireMissingJobs call must include niche: ${call.slice(0, 80)}`).toMatch(/niche/);
    }
  });

  it("ingest.ts no longer defines buildPublicUrl locally (imports from shared module)", () => {
    // After WR-06 extraction, ingest.ts must import (not define) buildPublicUrl
    expect(ingestSrc).toMatch(/import\s*\{[^}]*buildPublicUrl[^}]*\}\s*from\s*["']\.\/build-public-url/);
    // Must NOT re-define it inline
    expect(ingestSrc).not.toMatch(/function\s+buildPublicUrl\s*\(/);
  });
});
