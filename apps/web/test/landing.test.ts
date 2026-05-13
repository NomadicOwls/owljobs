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
});
