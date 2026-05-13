import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("apps/web/src/pages/[landingSlug].astro — SEO landing pages", () => {
  let src = "";
  beforeAll(async () => {
    try {
      src = await readFile(
        new URL("../src/pages/[landingSlug].astro", import.meta.url),
        "utf-8",
      );
    } catch {
      src = "";
    }
  });

  it("uses niche.landingPages whitelist", () => {
    expect(src).toMatch(/landingPages/);
  });

  it("redirects to 404 for unknown slugs", () => {
    expect(src).toMatch(/redirect\(\s*["']\/404/);
  });

  it("multi-niche: prefix derived from niche, no hardcoded wind-turbine string", () => {
    expect(src).not.toMatch(/["']wind-turbine-jobs["']/);
  });

  it("passes filters.location as location param (not folded into q)", () => {
    // The old (broken) pattern folded location into q → title search only.
    // New pattern: location passed as a separate named param to listJobs.
    // Uses ES6 shorthand { location } instead of { location: location }
    expect(src).toMatch(/,\s*location\s*[}\)]/);
  });

  it("passes keywords array directly (OR semantics, not joined string)", () => {
    // keywords is now passed as an array for OR-semantics via listJobs `keywords` param.
    // The old pattern (q: keywords with join(" ")) produced substring-AND, matching nothing.
    expect(src).toMatch(/\bkeywords\b/);
    expect(src).not.toMatch(/keywords\.join/);
  });
});
