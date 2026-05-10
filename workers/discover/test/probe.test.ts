import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("workers/discover/src/index.ts — ATS detection source contract (COVG-01, D-01..D-04)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("workers/discover/src/index.ts", "utf-8");
  });

  it("checks Authorization Bearer DISCOVER_SECRET before executing probe (security)", () => {
    expect(src).toMatch(/DISCOVER_SECRET/);
    expect(src).toMatch(/Authorization|Bearer/);
    expect(src).toMatch(/401/);
  });

  it("queries only status='pending' candidates", () => {
    expect(src).toMatch(/status.*['"]pending['"]|['"]pending['"].*status/);
  });

  // ATS platform coverage (D-04) — all 8 platforms
  it("detects Workday (/wday/ URL pattern)", () => {
    expect(src).toMatch(/wday/);
  });

  it("detects Greenhouse (/boards/ path)", () => {
    expect(src).toMatch(/boards/);
  });

  it("detects Lever (jobs.lever.co)", () => {
    expect(src).toMatch(/lever\.co/);
  });

  it("detects SmartRecruiters (jobs.smartrecruiters.com)", () => {
    expect(src).toMatch(/smartrecruiters/i);
  });

  it("detects Recruitee (.recruitee.com domain)", () => {
    expect(src).toMatch(/recruitee\.com/);
  });

  it("detects Softgarden (.softgarden.io domain)", () => {
    expect(src).toMatch(/softgarden\.io/);
  });

  it("detects Ashby (jobs.ashbyhq.com)", () => {
    expect(src).toMatch(/ashbyhq\.com/);
  });

  it("detects iCIMS (icims.com pattern)", () => {
    expect(src).toMatch(/icims\.com/);
  });

  // Confidence scoring (3-tier scheme from RESEARCH.md Specifics)
  it("assigns confidence 1.0 for exact URL pattern match", () => {
    expect(src).toMatch(/confidence:\s*1\.0|confidence\s*=\s*1\.0|1\.0.*confidence/);
  });

  it("assigns confidence 0.8 for domain match", () => {
    expect(src).toMatch(/confidence:\s*0\.8|confidence\s*=\s*0\.8|0\.8.*confidence/);
  });

  it("assigns confidence 0.6 for script/link tag reference", () => {
    expect(src).toMatch(/confidence:\s*0\.6|confidence\s*=\s*0\.6|0\.6.*confidence/);
  });

  // Status values written back to candidates table (D-03)
  it("writes status 'detected' for positive ATS detection", () => {
    expect(src).toMatch(/['"]detected['"]/);
  });

  it("writes status 'unknown' when no ATS found", () => {
    expect(src).toMatch(/['"]unknown['"]/);
  });

  it("writes status 'error' on fetch failure", () => {
    expect(src).toMatch(/['"]error['"]/);
  });
});
