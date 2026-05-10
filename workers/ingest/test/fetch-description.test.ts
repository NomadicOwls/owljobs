import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";

describe("fetch-description.ts — ats_type routing contract (SEO-02, D-20, Pitfalls 3+6)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("workers/ingest/src/fetch-description.ts", "utf-8");
  });

  it("is tracked in git (Pitfall 6 — was untracked, must be committed)", () => {
    const out = execSync("git ls-files workers/ingest/src/fetch-description.ts", { encoding: "utf-8" }).trim();
    expect(out).toBe("workers/ingest/src/fetch-description.ts");
  });

  it("routes ats_type === \"workday\" to fetchWorkdayJobDescription", () => {
    expect(src).toMatch(/ats_type\s*===\s*["']workday["']/);
    expect(src).toMatch(/fetchWorkdayJobDescription/);
  });

  it("routes ats_type === \"successfactors\" to fetchSuccessFactorsJobDescription", () => {
    expect(src).toMatch(/ats_type\s*===\s*["']successfactors["']/);
    expect(src).toMatch(/fetchSuccessFactorsJobDescription/);
  });

  it("routes ats_type === \"recruitee\" to fetchRecruiteeJobDescription", () => {
    expect(src).toMatch(/ats_type\s*===\s*["']recruitee["']/);
    expect(src).toMatch(/fetchRecruiteeJobDescription/);
  });

  it("routes ats_type === \"smartrecruiters\" to detail endpoint (Pitfall 3)", () => {
    expect(src).toMatch(/ats_type\s*===\s*["']smartrecruiters["']/);
    expect(src).toMatch(/api\.smartrecruiters\.com\/v1\/companies/);
  });

  it("SmartRecruiters branch applies sanitizeJobDescription before returning", () => {
    const idx = src.search(/ats_type\s*===\s*["']smartrecruiters["']/);
    expect(idx).toBeGreaterThan(-1);
    // Slice forward — the branch body should contain sanitizeJobDescription
    const branch = src.slice(idx, idx + 1500);
    expect(branch).toMatch(/sanitizeJobDescription/);
  });

  it("falls through with return null for unsupported ats_type (greenhouse/softgarden)", () => {
    // The last few lines should be a return null fallthrough comment + return statement
    expect(src).toMatch(/return null;\s*\n?\}\s*$/);
  });
});
