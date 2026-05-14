import { sha256Hex } from "@owljobs/schema";
import type { SuccessFactorsTarget } from "@owljobs/niches";
import type { AdaptedJob } from "./workday.js";
import { sanitizeJobDescription } from "./sanitize.js";

// SAP SuccessFactors / Taleo career portal HTML scraper.
// Both Vestas (careers.vestas.com) and NextEra (jobs.nexteraenergy.com) use
// server-rendered HTML with <tr class="data-row"> job rows — no browser needed.

const PAGE_SIZE = 25;
const MAX_PAGES = 25; // 625 jobs per employer per run — wind employers rarely exceed this

export class SuccessFactorsAdapterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "SuccessFactorsAdapterError";
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// "Results 1 – 25 of 244"  →  244
function parseTotal(html: string): number {
  const m = /\bof\s+([\d,]+)/i.exec(html);
  return m ? parseInt(m[1]!.replace(/,/g, ""), 10) : 0;
}

interface RawSFJob {
  title: string;
  href: string;
  location: string;
  postedOn: string;
}

function parseRows(html: string): RawSFJob[] {
  const jobs: RawSFJob[] = [];

  // Split on <tr class="...data-row..."> boundaries
  const rowChunks = html.split(/<tr\b[^>]*class="[^"]*\bdata-row\b[^"]*"[^>]*>/i).slice(1);

  for (const chunk of rowChunks) {
    // Trim to this row only (avoid bleeding into the next)
    const row = chunk.split(/<\/tr\b/i)[0] ?? chunk;

    // Title link — handles both Vestas (class="jobTitle-link") and
    // NextEra (link inside td.colTitle) templates
    const titlePats = [
      /<a\b[^>]+class="[^"]*\bjobTitle\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
      /<a\b[^>]+href="([^"]+)"[^>]+class="[^"]*\bjobTitle\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
      /class="[^"]*\bcolTitle\b[^"]*"[\s\S]*?<a\b[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    ];
    let href = "";
    let rawTitle = "";
    for (const pat of titlePats) {
      const m = pat.exec(row);
      if (m?.[1] && m?.[2]) {
        href = m[1].trim();
        rawTitle = m[2];
        break;
      }
    }
    if (!href) continue;

    const title = decodeHtmlEntities(rawTitle.replace(/<[^>]+>/g, "").trim());

    // Location
    const locPats = [
      /class="[^"]*\bjobLocation\b[^"]*"[^>]*>([\s\S]*?)(?=<\/)/i,
      /class="[^"]*\bcolLocation\b[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
      /class="[^"]*\bcolLocation\b[^"]*"[^>]*>([\s\S]*?)(?=<\/)/i,
    ];
    let location = "";
    for (const p of locPats) {
      const m = p.exec(row);
      if (m?.[1]) {
        location = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, "").trim());
        break;
      }
    }

    // Date
    const datePats = [
      /class="[^"]*\bjobDate\b[^"]*"[^>]*>([\s\S]*?)(?=<\/)/i,
      /class="[^"]*\bcolDate\b[^"]*"[^>]*>([\s\S]*?)(?=<\/)/i,
    ];
    let postedOn = "";
    for (const p of datePats) {
      const m = p.exec(row);
      if (m?.[1]) {
        postedOn = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, "").trim());
        break;
      }
    }

    jobs.push({ title, href, location, postedOn });
  }

  return jobs;
}

// "3 May 2026", "Apr 30, 2026", "May 3, 2026"  →  ISO string
// Falls back to now() if unparseable (better than null for a recent-first sort)
function parseSfDate(s: string): string {
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function fetchPage(
  careersBaseUrl: string,
  searchPath: string,
  startRow: number,
  searchText: string
): Promise<string> {
  const url = new URL(searchPath, careersBaseUrl);
  if (searchText) url.searchParams.set("q", searchText);
  url.searchParams.set("startrow", String(startRow));
  url.searchParams.set("locale", "en_US");
  url.searchParams.set("sortColumn", "referencedate");
  url.searchParams.set("sortDirection", "desc");

  const resp = await fetch(url.toString(), {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible)" },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new SuccessFactorsAdapterError(
      `SuccessFactors HTTP ${resp.status} for ${url}: ${body.slice(0, 200)}`,
      resp.status
    );
  }
  return resp.text();
}

export async function fetchAllSuccessFactorsJobs(
  target: SuccessFactorsTarget
): Promise<AdaptedJob[]> {
  const searchPath = target.searchPath ?? "/search/";
  const searchText = target.searchText ?? "";

  const firstHtml = await fetchPage(target.careersBaseUrl, searchPath, 0, searchText);
  const total = parseTotal(firstHtml);
  const rawJobs = parseRows(firstHtml);

  const remainingPages = Math.min(
    Math.ceil((total - PAGE_SIZE) / PAGE_SIZE),
    MAX_PAGES - 1
  );

  for (let page = 1; page <= remainingPages; page++) {
    const html = await fetchPage(
      target.careersBaseUrl,
      searchPath,
      page * PAGE_SIZE,
      searchText
    );
    rawJobs.push(...parseRows(html));
  }

  const results: AdaptedJob[] = [];
  for (const raw of rawJobs) {
    const canonicalUrl = raw.href.startsWith("http")
      ? raw.href
      : `${target.careersBaseUrl}${raw.href}`;
    const sourceId = await sha256Hex(canonicalUrl);
    results.push({
      title: raw.title,
      location: raw.location,
      postedOn: parseSfDate(raw.postedOn),
      canonicalUrl,
      sourceUrl: canonicalUrl,
      employerName: target.employer,
      sourceId,
      rawPayload: JSON.stringify(raw),
      description: null,
    });
  }

  return results;
}

// Fetches the full job description from a SuccessFactors job detail page.
// Both Vestas (careers.vestas.com) and NextEra (jobs.nexteraenergy.com) use
// <span class="jobdescription"> as the container; extraction pattern verified
// against both sites.
export async function fetchSuccessFactorsJobDescription(
  canonicalUrl: string
): Promise<string | null> {
  try {
    const resp = await fetch(canonicalUrl, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible)" },
    });
    if (!resp.ok) {
      console.warn(`[sf-desc] ${resp.status} ${resp.statusText} — ${canonicalUrl}`);
      return null;
    }

    const html = await resp.text();
    const parts = html.split(/class="jobdescription">/i);
    if (parts.length < 2) {
      console.warn(`[sf-desc] jobdescription marker not found (${html.length}b) — ${canonicalUrl}`);
      return null;
    }

    // Content ends at the first </span> that's followed by a block element close —
    // verified against both Vestas (<\/span>\s+<\/div>) and NextEra (<\/span>\s+<p\s).
    const m = /(<\/span>)\s*(?:<\/div|<p\s)/i.exec(parts[1]!);
    const rawContent = m ? parts[1]!.slice(0, m.index) : parts[1]!;

    return sanitizeJobDescription(rawContent.trim());
  } catch {
    return null;
  }
}
