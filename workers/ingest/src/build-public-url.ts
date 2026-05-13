// workers/ingest/src/build-public-url.ts
//
// Shared helper — extracted from ingest.ts and enrich.ts (WR-06).
// Google Indexing API requires the URL it can crawl from Search Console,
// NOT the employer's ATS URL (Pitfall 8). Always use this helper for ping URLs.

import type { NicheConfig } from "@owljobs/niches";

/**
 * Build the niche public URL for a job.
 * Slug is the first 12 chars of the job ID, matching apps/web/src/lib/slug.ts.
 *
 * @example buildPublicUrl({ domain: "mywindturbinejobs.com" }, "abc123def456xyz") => "https://mywindturbinejobs.com/jobs/abc123def456"
 */
export function buildPublicUrl(niche: NicheConfig, jobId: string): string {
  return `https://${niche.domain}/jobs/${jobId.slice(0, 12)}`;
}
