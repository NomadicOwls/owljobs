import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("ingest.ts — creation pings (SEO-03, D-19, Pitfall 8)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("workers/ingest/src/ingest.ts", "utf-8");
  });

  it("imports pingUrlUpdated from google-indexing", () => {
    expect(src).toMatch(/import\s*\{[^}]*pingUrlUpdated[^}]*\}\s*from\s*["']\.\/google-indexing/);
  });

  it("defines a buildPublicUrl helper", () => {
    expect(src).toMatch(/function\s+buildPublicUrl|const\s+buildPublicUrl\s*=/);
  });

  it("buildPublicUrl uses niche.domain (NOT canonical_url) per Pitfall 8", () => {
    // Find the helper body — look for `niche.domain` referenced near it
    const idx = src.search(/buildPublicUrl/);
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/niche\.domain/);
    expect(block).not.toMatch(/canonical_url/);
  });

  it("defines CREATION_PING_BUDGET (Pitfall 2 — quota cap)", () => {
    expect(src).toMatch(/CREATION_PING_BUDGET\s*=\s*\d+/);
  });

  it("calls pingUrlUpdated with buildPublicUrl (NOT canonical_url) post-insert", () => {
    // pingUrlUpdated must be called with buildPublicUrl(...), not job.canonical_url
    const callMatches = src.match(/pingUrlUpdated\s*\([\s\S]{0,200}?\)/g) ?? [];
    const buildPublicCalls = callMatches.filter((c) => /buildPublicUrl/.test(c));
    expect(buildPublicCalls.length).toBeGreaterThan(0);
  });

  it("each native ingest function has a ping call inside its insert path", () => {
    for (const fn of ["ingestWorkday", "ingestGreenhouse", "ingestSuccessFactors", "ingestRecruitee", "ingestSoftgarden"]) {
      const startIdx = src.indexOf(`async function ${fn}(`);
      expect(startIdx).toBeGreaterThan(-1);
      // Bound the function body by the next function declaration or by 4500 chars
      const nextFn = src.indexOf("async function ", startIdx + fn.length + 20);
      const endIdx = nextFn === -1 ? startIdx + 4500 : nextFn;
      const body = src.slice(startIdx, endIdx);
      expect(body, `${fn} must call pingUrlUpdated with buildPublicUrl`).toMatch(/pingUrlUpdated\s*\([\s\S]*?buildPublicUrl/);
    }
  });

  it("ping is skipped when saJson is absent (matches expire.ts pattern)", () => {
    // Pattern: `if (saJson)` or `saJson &&` guard around ping calls
    expect(src).toMatch(/if\s*\(\s*saJson\s*\)|saJson\s*&&/);
  });
});
