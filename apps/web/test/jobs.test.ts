import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("lib/jobs.ts — DATA-02 status='active' filter", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile(new URL("../src/lib/jobs.ts", import.meta.url), "utf-8");
  });

  // Helper: extract the body of an exported async function by name.
  // Finds the next `export async function` after the current one to bound the slice.
  function extractFnBody(source: string, fnName: string): string {
    const marker = `export async function ${fnName}`;
    const startIdx = source.indexOf(marker);
    if (startIdx === -1) throw new Error(`Function ${fnName} not found`);
    // Find the start of the next exported function to bound the slice
    const nextFnIdx = source.indexOf("export async function ", startIdx + marker.length);
    const endIdx = nextFnIdx === -1 ? startIdx + 3000 : nextFnIdx;
    return source.slice(startIdx, endIdx);
  }

  it('listJobs filters .eq("status", "active")', () => {
    const body = extractFnBody(src, "listJobs");
    expect(body).toMatch(/\.eq\(\s*"status"\s*,\s*"active"\s*\)/);
  });

  it('listFeedJobs filters .eq("status", "active")', () => {
    const body = extractFnBody(src, "listFeedJobs");
    expect(body).toMatch(/\.eq\(\s*"status"\s*,\s*"active"\s*\)/);
  });

  it('listSitemapJobs filters .eq("status", "active")', () => {
    const body = extractFnBody(src, "listSitemapJobs");
    expect(body).toMatch(/\.eq\(\s*"status"\s*,\s*"active"\s*\)/);
  });

  it('listEmployerJobs filters .eq("status", "active")', () => {
    const body = extractFnBody(src, "listEmployerJobs");
    expect(body).toMatch(/\.eq\(\s*"status"\s*,\s*"active"\s*\)/);
  });

  it("getStats has BOTH status='active' AND expires_at filters (independent semantics)", () => {
    const body = extractFnBody(src, "getStats");
    // status filter — appears at LEAST twice (activeJobs + recent)
    const statusMatches = body.match(/\.eq\(\s*"status"\s*,\s*"active"\s*\)/g);
    expect(statusMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
    // existing expires_at filter preserved
    expect(body).toMatch(/expires_at\.is\.null,expires_at\.gt\./);
  });

  it("getJobBySlug DOES NOT filter status (must return expired rows for 410 branch)", () => {
    const body = extractFnBody(src, "getJobBySlug");
    expect(body).not.toMatch(/\.eq\(\s*"status"\s*,/);
  });
});
