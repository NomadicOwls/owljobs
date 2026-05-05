import { sha256Hex } from "@owljobs/schema";
import type { GreenhouseTarget } from "@owljobs/niches";
import { sanitizeJobDescription } from "./sanitize.js";

// Greenhouse Job Board API v1 — public, no auth required for job listings
// Docs: https://developers.greenhouse.io/job-board.html

interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  location: { name: string };
  departments: Array<{ name: string }>;
  offices: Array<{ name: string; country_code: string }>;
  absolute_url: string;
  content: string; // HTML description
}

interface GreenhouseJobsResponse {
  jobs: GreenhouseJob[];
  meta: { total: number };
}

export interface AdaptedJob {
  title: string;
  location: string;
  postedOn: string;
  canonicalUrl: string;
  sourceUrl: string;
  employerName: string;
  sourceId: string;
  rawPayload: string;
  country: string | null;
  description: string | null;
}

const GREENHOUSE_BASE = "https://boards-api.greenhouse.io/v1/boards";

export async function fetchAllGreenhouseJobs(
  target: GreenhouseTarget
): Promise<AdaptedJob[]> {
  const url = `${GREENHOUSE_BASE}/${target.boardToken}/jobs?content=true`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Greenhouse API ${response.status} for board "${target.boardToken}": ${text}`
    );
  }

  const data = (await response.json()) as GreenhouseJobsResponse;

  return Promise.all(
    data.jobs.map(async (job) => {
      const canonicalUrl = job.absolute_url;
      const sourceId = await sha256Hex(canonicalUrl);
      const country = job.offices[0]?.country_code ?? null;

      return {
        title: job.title,
        location: job.location.name,
        postedOn: job.updated_at,
        canonicalUrl,
        sourceUrl: canonicalUrl,
        employerName: target.employer,
        sourceId,
        rawPayload: JSON.stringify(job),
        country,
        description: job.content ? sanitizeJobDescription(job.content) : null,
      };
    })
  );
}
