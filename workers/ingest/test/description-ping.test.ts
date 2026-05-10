import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("enrich.ts — description-update pings (SEO-03, D-19, Pitfall 8)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("workers/ingest/src/enrich.ts", "utf-8");
  });

  it("imports pingUrlUpdated from google-indexing", () => {
    expect(src).toMatch(/import\s*\{[^}]*pingUrlUpdated[^}]*\}\s*from\s*["']\.\/google-indexing/);
  });

  it("calls pingUrlUpdated after a successful description update", () => {
    // The update call is `db.from("jobs").update({ description })` followed (in success branch) by ping
    expect(src).toMatch(/\.update\(\s*\{\s*description[\s\S]*?\}\s*\)[\s\S]{0,500}?pingUrlUpdated/);
  });

  it("ping uses buildPublicUrl (NOT row.canonical_url) per Pitfall 8", () => {
    const calls = src.match(/pingUrlUpdated\s*\([\s\S]{0,200}?\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c).toMatch(/buildPublicUrl/);
      expect(c).not.toMatch(/canonical_url/);
    }
  });

  it("defines DESCRIPTION_PING_BUDGET cap (Pitfall 2)", () => {
    expect(src).toMatch(/DESCRIPTION_PING_BUDGET\s*=\s*\d+/);
  });

  it("ping is gated on saJson presence", () => {
    expect(src).toMatch(/if\s*\(\s*saJson\s*\)|saJson\s*&&/);
  });
});
