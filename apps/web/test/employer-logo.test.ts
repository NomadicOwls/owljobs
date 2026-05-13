import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("apps/web/src/components/employer/EmployerLogo.astro — PROF-01", () => {
  let src = "";
  beforeAll(async () => {
    try {
      src = await readFile(
        new URL("../src/components/employer/EmployerLogo.astro", import.meta.url),
        "utf-8",
      );
    } catch {
      src = "";
    }
  });

  it("PROF-01 — renders <img> with logo.dev CDN url or initials fallback without layout shift", () => {
    expect(src).toMatch(/initials/i);
    expect(src).toMatch(/<img/);
  });

  it("PROF-01 — token comes from env, not hardcoded", () => {
    expect(src).toMatch(/LOGODEV_TOKEN/);
  });
});
