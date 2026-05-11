import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("ingest.ts — aggregator no-expire + no-upsertEmployer (COVG-03, Pitfall 1)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("workers/ingest/src/ingest.ts", "utf-8");
  });

  function fnBody(name: string): string {
    const idx = src.indexOf(`async function ${name}(`);
    if (idx === -1) throw new Error(`Function ${name} not found`);
    const next = src.indexOf("async function ", idx + name.length + 20);
    const end = next === -1 ? idx + 4500 : next;
    return src.slice(idx, end);
  }

  it("ingestAdzuna exists", () => {
    expect(() => fnBody("ingestAdzuna")).not.toThrow();
  });

  it("ingestJSearch exists", () => {
    expect(() => fnBody("ingestJSearch")).not.toThrow();
  });

  it("ingestAdzuna does NOT call expireMissingJobs (Pitfall 1)", () => {
    expect(fnBody("ingestAdzuna")).not.toMatch(/expireMissingJobs/);
  });

  it("ingestJSearch does NOT call expireMissingJobs (Pitfall 1)", () => {
    expect(fnBody("ingestJSearch")).not.toMatch(/expireMissingJobs/);
  });

  it("ingestAdzuna does NOT call upsertEmployer (Pitfall 1 — employer collision)", () => {
    expect(fnBody("ingestAdzuna")).not.toMatch(/upsertEmployer/);
  });

  it("ingestJSearch does NOT call upsertEmployer", () => {
    expect(fnBody("ingestJSearch")).not.toMatch(/upsertEmployer/);
  });

  it("ingestAdzuna writes a sentinel employer_id (not derived from real employer name)", () => {
    // Adapter must use a stable sentinel — typically sha256("adzuna") computed once
    // OR a hardcoded UUID. Check that some employer_id is being passed but NOT via upsertEmployer.
    expect(fnBody("ingestAdzuna")).toMatch(/employer_id|employerId/i);
  });

  it("ingest.ts dispatch branch for adzuna calls ingestAdzuna (not the stub)", () => {
    // Find the adzuna branch in ingestNiche; should NOT contain the STUB log
    const branchIdx = src.indexOf('target.atsType === "adzuna"');
    expect(branchIdx).toBeGreaterThan(-1);
    const branch = src.slice(branchIdx, branchIdx + 200);
    expect(branch).toMatch(/ingestAdzuna\s*\(/);
    expect(branch).not.toMatch(/STUB/);
  });

  it("ingest.ts dispatch branch for jsearch calls ingestJSearch (not the stub)", () => {
    const branchIdx = src.indexOf('target.atsType === "jsearch"');
    expect(branchIdx).toBeGreaterThan(-1);
    const branch = src.slice(branchIdx, branchIdx + 200);
    expect(branch).toMatch(/ingestJSearch\s*\(/);
    expect(branch).not.toMatch(/STUB/);
  });
});
