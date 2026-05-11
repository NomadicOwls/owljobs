import { sha256Hex } from "@owljobs/schema";
import type { SmartRecruitersTarget } from "@owljobs/niches";

// SmartRecruiters Postings API list response shape
// Verified — Phase 2 RESEARCH.md lines 290-345.
// NOTE: descriptions are NOT in the list response (Pitfall 3 — use detail endpoint in fetch-description.ts).
interface SmartRecruitersListPosting {
  id: string;
  uuid?: string;
  name: string;
  releasedDate?: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
    remote?: boolean;
    latitude?: number;
    longitude?: number;
  };
  ref?: string;
}

interface SmartRecruitersListResponse {
  limit: number;
  offset: number;
  totalFound: number;
  content: SmartRecruitersListPosting[];
}

export interface AdaptedJob {
  title: string;
  location: string;
  postedOn: string | null;
  canonicalUrl: string;
  sourceUrl: string;
  employerName: string;
  sourceId: string;
  rawPayload: string;
  /** ALWAYS null for SmartRecruiters list (Pitfall 3 — lazy fetch via detail endpoint in enrich stage) */
  description: null;
}

const PAGE_SIZE = 100;
/** Guard against runaway pagination — SmartRecruiters companies rarely have more than 500 public roles */
const MAX_RECORDS = 1000;

export class SmartRecruitersAdapterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "SmartRecruitersAdapterError";
  }
}

function buildLocation(loc?: SmartRecruitersListPosting["location"]): string {
  if (!loc) return "";
  if (loc.remote) return "Remote";
  return [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
}

async function fetchPage(
  companyId: string,
  offset: number,
  limit: number,
): Promise<SmartRecruitersListResponse> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?status=PUBLIC&limit=${limit}&offset=${offset}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) {
    throw new SmartRecruitersAdapterError(
      `SmartRecruiters list ${resp.status} for ${companyId} (offset=${offset})`,
      resp.status,
    );
  }
  return (await resp.json()) as SmartRecruitersListResponse;
}

/**
 * Fetches all public job postings for a SmartRecruiters employer.
 *
 * Architecture: LAZY-FETCH — list endpoint returns titles/locations only.
 * Descriptions are fetched in the enrich stage via fetch-description.ts (Plan 04, Pitfall 3).
 *
 * Pagination: offset + limit query params, totalFound cap at MAX_RECORDS.
 */
export async function fetchAllSmartRecruitersJobs(
  target: SmartRecruitersTarget,
): Promise<AdaptedJob[]> {
  const out: AdaptedJob[] = [];
  let offset = 0;

  while (out.length < MAX_RECORDS) {
    const page = await fetchPage(target.companyId, offset, PAGE_SIZE);

    if (page.content.length === 0) break;

    for (const p of page.content) {
      const canonicalUrl = `https://jobs.smartrecruiters.com/${target.companyId}/${p.id}`;
      const sourceId = await sha256Hex(canonicalUrl);
      out.push({
        title: p.name,
        location: buildLocation(p.location),
        postedOn: p.releasedDate ?? null,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        employerName: target.employer,
        sourceId,
        rawPayload: JSON.stringify(p),
        description: null,
      });
    }

    offset += PAGE_SIZE;
    if (offset >= page.totalFound) break;
  }

  return out;
}
