import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("apps/web/src/pages/api/employer/claim.ts — PROF-02", () => {
  let src = "";
  beforeAll(async () => {
    try {
      src = await readFile(
        new URL("../src/pages/api/employer/claim.ts", import.meta.url),
        "utf-8",
      );
    } catch {
      src = "";
    }
  });

  it("PROF-02 — extracts domain from email server-side (not client-provided)", () => {
    expect(src).toMatch(/email\.split\("@"\)\[1\]/);
  });

  it("PROF-02 — looks up employer by domain; generateLink fires before insert (Pitfall 8)", () => {
    expect(src).toMatch(/domain/);
    const insertIdx = src.indexOf("employer_users");
    expect(insertIdx).toBeGreaterThan(-1);
    const linkIdx = src.indexOf("generateLink");
    expect(linkIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(linkIdx);
  });

  it("PROF-02 — multi-niche: reads niche.supabaseSchema, not hardcoded", () => {
    expect(src).toMatch(/niche\.supabaseSchema/);
    expect(src).not.toMatch(/wind_turbine/);
  });
});
