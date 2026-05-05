import { sha256Hex } from "@owljobs/schema";
import type { RecruiteeTarget } from "@owljobs/niches";
import type { AdaptedJob } from "./workday.js";
import { sanitizeJobDescription } from "./sanitize.js";

interface RecruiteeOffer {
  id: number;
  title: string;
  slug: string;
  city: string | null;
  country: string | null;
  country_code: string | null;
  published_at: string;
  careers_url: string;
  description: string | null;
  requirements: string | null;
}

interface RecruiteeResponse {
  offers: RecruiteeOffer[];
}

export class RecruiteeAdapterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "RecruiteeAdapterError";
  }
}

export async function fetchAllRecruiteeJobs(target: RecruiteeTarget): Promise<AdaptedJob[]> {
  const url = `https://${target.companySlug}.recruitee.com/api/offers/`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new RecruiteeAdapterError(
      `Recruitee API returned ${response.status} for ${url}`,
      response.status
    );
  }

  const data = (await response.json()) as RecruiteeResponse;
  const results: AdaptedJob[] = [];

  for (const offer of data.offers) {
    const canonicalUrl = offer.careers_url;
    if (!canonicalUrl) continue;

    const sourceId = await sha256Hex(canonicalUrl);
    const location = [offer.city, offer.country].filter(Boolean).join(", ") || null;

    const rawDescription = [offer.description, offer.requirements].filter(Boolean).join("\n");
    const description = rawDescription ? sanitizeJobDescription(rawDescription) : null;

    results.push({
      title: offer.title,
      location: location ?? "",
      postedOn: offer.published_at,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      employerName: target.employer,
      sourceId,
      rawPayload: JSON.stringify(offer),
      description,
    });
  }

  return results;
}

// Fetches a single offer's description using the canonical URL.
// URL format: https://{company}.recruitee.com/o/{slug}
// API endpoint: https://{company}.recruitee.com/api/offers/{slug}
export async function fetchRecruiteeJobDescription(canonicalUrl: string): Promise<string | null> {
  try {
    const url = new URL(canonicalUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "o" || !parts[1]) return null;
    const offerSlug = parts[1];
    const apiUrl = `${url.origin}/api/offers/${offerSlug}`;

    const resp = await fetch(apiUrl, { headers: { Accept: "application/json" } });
    if (!resp.ok) return null;

    const data = (await resp.json()) as { offer?: { description?: string; requirements?: string } };
    const rawDescription = [data.offer?.description, data.offer?.requirements].filter(Boolean).join("\n");
    return rawDescription ? sanitizeJobDescription(rawDescription) : null;
  } catch {
    return null;
  }
}
