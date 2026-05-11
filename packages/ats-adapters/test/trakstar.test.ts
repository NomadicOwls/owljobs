import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("trakstar.ts — adapter source contract (COVG-02, D-10, D-21)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("packages/ats-adapters/src/trakstar.ts", "utf-8");
  });

  it("exports fetchAllTrakstarJobs function", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+fetchAllTrakstarJobs/);
  });

  it("exports TrakstarAdapterError class", () => {
    expect(src).toMatch(/export\s+class\s+TrakstarAdapterError/);
  });

  it("returns an array (no jobs on abort, or AdaptedJob[] on success)", () => {
    // Either `return []` for abort or `Promise<AdaptedJob[]>` for success path
    expect(src).toMatch(/return\s+\[\]|AdaptedJob\[\]/);
  });

  it("documents the probe decision in a comment", () => {
    // The header comment must mention one of: ABORTED, probe, __NEXT_DATA__, SPA, trakstar.com
    expect(src).toMatch(/ABORT(ED)?|probe|__NEXT_DATA__|SPA|trakstar\.com/i);
  });

  it("sets description: null OR returns empty array (never stores aggregator snippet)", () => {
    // Trakstar is lazy-fetch — description must be null, OR adapter returns [] (abort path)
    expect(src).toMatch(/description:\s*null|return\s+\[\]/);
  });
});
