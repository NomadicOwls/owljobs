import { sha256Hex } from "@owljobs/schema";
import type { WorkdayTarget } from "@owljobs/niches";
import { sanitizeJobDescription } from "./sanitize.js";

// Workday CXS API response shapes
interface WorkdayJobPosting {
  title: string;
  locationsText: string;
  postedOn: string;        // e.g. "Posted 3 Days Ago"
  externalPath: string;    // e.g. "/en-US/External/job/US-TX/Wind-Tech_R123456"
  bulletFields: string[];
}

interface WorkdayJobsResponse {
  jobPostings: WorkdayJobPosting[];
  total: number;
}

export interface AdaptedJob {
  title: string;
  location: string;
  postedOn: string;
  canonicalUrl: string;
  sourceUrl: string;       // same as canonicalUrl for Workday (it IS the employer source)
  employerName: string;
  sourceId: string;        // sha256(canonicalUrl)
  rawPayload: string;      // JSON for re-processing
  description: string | null;
}

const PAGE_SIZE = 20;
const MAX_PAGES = 25; // 500 jobs per employer per run — wind employers rarely exceed this

function buildBaseUrl(target: WorkdayTarget): string {
  return `https://${target.tenant}.${target.instance}.myworkdayjobs.com`;
}

function buildApiUrl(target: WorkdayTarget): string {
  return `${buildBaseUrl(target)}/wday/cxs/${target.tenant}/${target.site}/jobs`;
}

async function fetchPage(
  apiUrl: string,
  offset: number,
  searchText = "",
  appliedFacets: Record<string, string | string[]> = {}
): Promise<WorkdayJobsResponse> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      // Workday CXS requires Origin to match the tenant domain
      Origin: new URL(apiUrl).origin,
    },
    body: JSON.stringify({
      appliedFacets,
      limit: PAGE_SIZE,
      offset,
      searchText,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new WorkdayAdapterError(
      `Workday API returned ${response.status} for ${apiUrl} (offset=${offset}): ${text}`,
      response.status
    );
  }

  return response.json() as Promise<WorkdayJobsResponse>;
}

export class WorkdayAdapterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "WorkdayAdapterError";
  }
}

export async function fetchAllWorkdayJobs(
  target: WorkdayTarget,
  searchText = ""
): Promise<AdaptedJob[]> {
  const apiUrl = buildApiUrl(target);
  const baseUrl = buildBaseUrl(target);
  const facets = target.appliedFacets ?? {};
  const results: AdaptedJob[] = [];

  // First page — also gives us the total so we know how many pages to fetch
  const firstPage = await fetchPage(apiUrl, 0, searchText, facets);
  const total = firstPage.total;

  for (const posting of firstPage.jobPostings) {
    results.push(await adaptPosting(posting, baseUrl, target.site, target.employer));
  }

  const remainingPages = Math.min(
    Math.ceil((total - PAGE_SIZE) / PAGE_SIZE),
    MAX_PAGES - 1
  );

  for (let page = 1; page <= remainingPages; page++) {
    const offset = page * PAGE_SIZE;
    const data = await fetchPage(apiUrl, offset, searchText, facets);
    for (const posting of data.jobPostings) {
      results.push(await adaptPosting(posting, baseUrl, target.site, target.employer));
    }
  }

  return results;
}

async function adaptPosting(
  posting: WorkdayJobPosting,
  baseUrl: string,
  site: string,
  employerName: string
): Promise<AdaptedJob> {
  // externalPath is e.g. /job/Remote/Senior-Wind-Tech_R123 — site name must be prepended.
  // Final URL: https://{tenant}.wd{n}.myworkdayjobs.com/{site}/job/...
  const canonicalUrl = `${baseUrl}/${site}${posting.externalPath}`;
  const sourceId = await sha256Hex(canonicalUrl);

  return {
    title: posting.title,
    location: posting.locationsText,
    postedOn: posting.postedOn,
    canonicalUrl,
    sourceUrl: canonicalUrl,
    employerName,
    sourceId,
    rawPayload: JSON.stringify(posting),
    description: null,
  };
}

// Fetches the full job description from the Workday CXS detail endpoint.
// Called by the enrich phase after classification — not during list ingest.
export async function fetchWorkdayJobDescription(
  target: WorkdayTarget,
  externalPath: string
): Promise<string | null> {
  const baseUrl = buildBaseUrl(target);
  // externalPath already includes the /job/ prefix (e.g. /job/Remote/Tech_R123)
  const url = `${baseUrl}/wday/cxs/${target.tenant}/${target.site}${externalPath}`;

  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "application/json",
        Origin: baseUrl,
      },
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as { jobPostingInfo?: { jobDescription?: string } };
    const html = data.jobPostingInfo?.jobDescription;
    if (!html) return null;

    return sanitizeJobDescription(html);
  } catch {
    return null;
  }
}
