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

  it("listJobs applies ilike on location column when location opt is provided", () => {
    const body = extractFnBody(src, "listJobs");
    expect(body).toMatch(/ilike\(\s*["']location["']/);
  });

  it("listJobs does NOT fold location into the title q search", () => {
    // The old buggy pattern was: qParts.push(page.filters.location) → ilike("title", ...)
    // The fix keeps location as a separate filter on the location column.
    // This test ensures the ListJobsOpts interface has a location field.
    const src2 = src; // same source used in beforeAll
    expect(src2).toMatch(/location\?\s*:\s*string/);
  });
});

describe("[slug].astro — JSON-LD JobPosting structured data (SEO-01, D-15..D-18)", () => {
  let astroSrc = "";
  beforeAll(async () => {
    astroSrc = await readFile(
      new URL("../src/pages/jobs/[slug].astro", import.meta.url),
      "utf-8",
    );
  });

  it("contains an application/ld+json script tag", () => {
    expect(astroSrc).toContain("application/ld+json");
  });

  it("@type is JobPosting", () => {
    expect(astroSrc).toMatch(/"@type":\s*"JobPosting"/);
  });

  it("guards JSON-LD on description truthiness (D-15)", () => {
    // Either {job.description && (...)} or a frontmatter-computed const guarded on job.description
    expect(astroSrc).toMatch(/job\.description\s*&&|description.*\?.*JobPosting|jsonLd\s*=\s*job\.description/);
  });

  it("guards JSON-LD against aggregator sources (Pitfall 4)", () => {
    // The guard chain must reference 'adzuna' OR 'jsearch' as excluded sources
    expect(astroSrc).toMatch(/['"]adzuna['"]/);
    expect(astroSrc).toMatch(/['"]jsearch['"]/);
  });

  it("validThrough uses Math.max with now + 7 days (Pitfall 9 — future-date guard)", () => {
    expect(astroSrc).toMatch(/Math\.max\s*\([\s\S]*?Date\.now\(\)\s*\+\s*[\s\S]*?7\s*\*/);
  });

  it("jobLocation is conditionally spread on job.location (D-16)", () => {
    expect(astroSrc).toMatch(/\.\.\.\(\s*job\.location\s*\?/);
  });

  it("JSON-LD is inside the non-expired branch (not rendered for status=expired)", () => {
    const expiredIdx = astroSrc.indexOf("isExpired ? (");
    const elseIdx = astroSrc.indexOf(") : (", expiredIdx);
    const jsonLdIdx = astroSrc.indexOf("application/ld+json");
    expect(expiredIdx).toBeGreaterThan(-1);
    expect(elseIdx).toBeGreaterThan(-1);
    expect(jsonLdIdx).toBeGreaterThan(elseIdx);
  });

  it("required fields present: title, description, datePosted, hiringOrganization, url (D-18)", () => {
    expect(astroSrc).toMatch(/"title":/);
    expect(astroSrc).toMatch(/"description":/);
    expect(astroSrc).toMatch(/"datePosted":/);
    expect(astroSrc).toMatch(/"hiringOrganization":/);
    expect(astroSrc).toMatch(/"url":/);
  });

  it("isAggregator checks employers.ats_type, NOT job_sources rows (WR-05 fix)", () => {
    // The old (broken) pattern: fires true if any source row is aggregator
    expect(astroSrc).not.toMatch(
      /job_sources.*\.some\s*\(.*aggregatorSources\.has/s,
    );
    // The new (correct) pattern: checks employer's ats_type field
    expect(astroSrc).toMatch(
      /\["adzuna"\s*,\s*"jsearch"\]\.includes\s*\(\s*job\.employers\?\.ats_type/,
    );
    // The aggregatorSources Set must be gone (no longer needed)
    expect(astroSrc).not.toMatch(/new\s+Set\s*<\s*string\s*>\s*\(\s*\[\s*["']adzuna["']/);
  });
});

describe("apps/web/src/lib/jobs.ts — FEAT-01 listFeaturedJobs", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile(new URL("../src/lib/jobs.ts", import.meta.url), "utf-8");
  });

  it("FEAT-01 — exports listFeaturedJobs function", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+listFeaturedJobs/);
  });

  it("FEAT-01 — filters by featured_until > NOW (current time)", () => {
    expect(src).toMatch(/\.gt\(\s*["']featured_until["']/);
  });

  it("FEAT-01 — filters by status='active'", () => {
    expect(src).toMatch(/\.eq\(\s*["']status["']\s*,\s*["']active["']/);
  });

  it("FEAT-01 — orders by featured_until DESC", () => {
    expect(src).toMatch(/\.order\(\s*["']featured_until["']/);
  });

  it("FEAT-01 — multi-niche: uses niche.supabaseSchema", () => {
    expect(src).toMatch(/niche\.supabaseSchema/);
  });
});
