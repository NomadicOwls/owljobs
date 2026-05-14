import { sha256Hex } from "@owljobs/schema";
import type { AdzunaTarget } from "@owljobs/niches";

// Adzuna /v1/api/jobs/{country}/search/{page} response (RESEARCH.md lines 211-247)
interface AdzunaResultLocation {
  area?: string[];
  display_name?: string;
}

interface AdzunaResultCompany {
  display_name?: string;
}

interface AdzunaResult {
  id: string;
  title: string;
  company?: AdzunaResultCompany;
  location?: AdzunaResultLocation;
  description?: string;       // teaser snippet — DO NOT use (Pitfall 4)
  created?: string;            // ISO 8601
  redirect_url: string;
  contract_type?: string;
}

interface AdzunaResponse {
  results: AdzunaResult[];
  count: number;
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
  description: string | null;
}

const RESULTS_PER_PAGE = 50;
const MAX_PAGES = 5; // 250 results per query — caps quota

export class AdzunaAdapterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AdzunaAdapterError";
  }
}

async function fetchPage(
  country: string,
  page: number,
  query: string,
  appId: string,
  appKey: string,
): Promise<AdzunaResponse> {
  // Builds: api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id=...&app_key=...&what=...
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("what", query);
  url.searchParams.set("results_per_page", String(RESULTS_PER_PAGE));
  url.searchParams.set("content-type", "application/json");

  const resp = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!resp.ok) {
    throw new AdzunaAdapterError(
      `Adzuna ${resp.status} for ${country}?what=${query}&page=${page}`,
      resp.status,
    );
  }
  return (await resp.json()) as AdzunaResponse;
}

export interface AdzunaCredentials {
  appId: string;
  appKey: string;
}

/**
 * Fetch all Adzuna results for a given target and a list of queries.
 * Caller (ingest.ts) supplies the queries from niche.aggregatorQueries.
 * description is the teaser snippet from the API — stored for user display but excluded from JSON-LD
 * via the isAggregator guard in the job detail page.
 */
export async function fetchAllAdzunaJobs(
  target: AdzunaTarget,
  queries: string[],
  creds: AdzunaCredentials,
): Promise<AdaptedJob[]> {
  const out: AdaptedJob[] = [];
  for (const query of queries) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      let resp: AdzunaResponse;
      try {
        resp = await fetchPage(target.country, page, query, creds.appId, creds.appKey);
      } catch (err) {
        if (err instanceof AdzunaAdapterError && err.statusCode >= 500) {
          // server error — skip remaining pages for this query
          break;
        }
        throw err;
      }
      if (!resp.results || resp.results.length === 0) break;

      for (const r of resp.results) {
        const canonicalUrl = r.redirect_url;
        const sourceId = await sha256Hex(canonicalUrl);
        out.push({
          title: r.title,
          location: r.location?.display_name ?? r.location?.area?.join(", ") ?? "",
          postedOn: r.created ?? null,
          canonicalUrl,
          sourceUrl: canonicalUrl,
          employerName: r.company?.display_name ?? "",
          sourceId,
          rawPayload: JSON.stringify(r),
          description: r.description ?? null,
        });
      }

      if (resp.results.length < RESULTS_PER_PAGE) break;
    }
  }
  return out;
}
