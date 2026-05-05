import { sha256Hex } from "@owljobs/schema";
import type { SoftgardenTarget } from "@owljobs/niches";
import type { AdaptedJob } from "./workday.js";
import { sanitizeJobDescription } from "./sanitize.js";

// Schema.org JobPosting as returned by Softgarden's JSON-LD feed
interface SoftgardenJobPosting {
  "@type": "JobPosting";
  title: string;
  url: string;
  datePosted: string;
  description?: string;
  employmentType?: string;
  jobLocation?: {
    address?: {
      addressLocality?: string;
      addressCountry?: string;
    };
  };
  hiringOrganization?: {
    name?: string;
  };
  identifier?: {
    value?: string | number;
  };
}

interface SoftgardenDataFeedItem {
  "@type": "DataFeedItem";
  dateModified: string;
  item: SoftgardenJobPosting;
}

interface SoftgardenFeed {
  "@context": string;
  "@type": "DataFeed";
  numberOfItems?: number;
  dataFeedElement: SoftgardenDataFeedItem[];
}

export class SoftgardenAdapterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "SoftgardenAdapterError";
  }
}

export async function fetchAllSoftgardenJobs(target: SoftgardenTarget): Promise<AdaptedJob[]> {
  const response = await fetch(target.feedUrl, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new SoftgardenAdapterError(
      `Softgarden feed returned ${response.status} for ${target.feedUrl}`,
      response.status
    );
  }

  const feed = (await response.json()) as SoftgardenFeed;
  const results: AdaptedJob[] = [];

  for (const item of feed.dataFeedElement) {
    const posting = item.item;
    if (!posting?.url || !posting?.title) continue;

    const canonicalUrl = posting.url;
    const sourceId = await sha256Hex(canonicalUrl);

    const city = posting.jobLocation?.address?.addressLocality ?? "";
    const country = posting.jobLocation?.address?.addressCountry ?? "";
    const location = [city, country].filter((s) => s && s !== "-").join(", ");

    // Softgarden feeds include full HTML descriptions — sanitize and store immediately,
    // skipping the enrich phase for these jobs.
    const description = posting.description
      ? sanitizeJobDescription(posting.description)
      : null;

    results.push({
      title: posting.title.trim(),
      location,
      postedOn: posting.datePosted,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      employerName: target.employer,
      sourceId,
      rawPayload: JSON.stringify(posting),
      description,
    });
  }

  return results;
}
