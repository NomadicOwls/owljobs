import { sha256Hex } from "@owljobs/schema";
import type { JSearchTarget } from "@owljobs/niches";

// JSearch (RapidAPI) response shape — RESEARCH.md lines 252-285
interface JSearchResult {
  job_id: string;
  employer_name?: string;
  job_title: string;
  job_description?: string;   // full HTML — but we set null anyway (consistent with aggregator policy)
  job_apply_link?: string;
  job_posted_at_datetime_utc?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
}

interface JSearchResponse {
  status: string;
  data: JSearchResult[];
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

const NUM_PAGES = 1;

export class JSearchAdapterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "JSearchAdapterError";
  }
}

async function fetchOne(query: string, apiKey: string): Promise<JSearchResponse> {
  const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&num_pages=${NUM_PAGES}`;
  const resp = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    throw new JSearchAdapterError(
      `JSearch ${resp.status} for query="${query}"`,
      resp.status,
    );
  }
  return (await resp.json()) as JSearchResponse;
}

export interface JSearchCredentials {
  apiKey: string;
}

/**
 * Fetch JSearch aggregator results for a list of queries.
 * job_description contains full HTML — stored for user display, excluded from JSON-LD
 * via the isAggregator guard in the job detail page.
 */
export async function fetchAllJSearchJobs(
  _target: JSearchTarget,
  queries: string[],
  creds: JSearchCredentials,
): Promise<AdaptedJob[]> {
  const out: AdaptedJob[] = [];
  for (const query of queries) {
    let resp: JSearchResponse;
    try {
      resp = await fetchOne(query, creds.apiKey);
    } catch (err) {
      if (err instanceof JSearchAdapterError && err.statusCode === 429) {
        // Rate limited — stop processing further queries this run
        break;
      }
      throw err;
    }
    if (resp.status !== "OK" || !resp.data?.length) continue;

    for (const r of resp.data) {
      const canonicalUrl = r.job_apply_link ?? `https://jsearch.p.rapidapi.com/job/${r.job_id}`;
      const sourceId = await sha256Hex(canonicalUrl);
      const location = [r.job_city, r.job_state, r.job_country].filter(Boolean).join(", ");
      out.push({
        title: r.job_title,
        location,
        postedOn: r.job_posted_at_datetime_utc ?? null,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        employerName: r.employer_name ?? "",
        sourceId,
        rawPayload: JSON.stringify(r),
        description: r.job_description ?? null,
      });
    }
  }
  return out;
}
