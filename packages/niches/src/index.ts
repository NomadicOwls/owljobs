/** How often this target is polled. Defaults to "hourly". Used by dispatcher in queue fan-out (Phase C). */
export type CronGroup = "hourly" | "every3h" | "every6h";

export interface WorkdayTarget {
  employer: string;
  atsType: "workday";
  tenant: string;
  instance: string;
  site: string;
  /** Optional keyword pre-filter passed to Workday CXS API searchText field */
  searchText?: string;
  /** Optional facet filters passed to Workday CXS API appliedFacets. Values may be a string or array of strings. Used e.g. to narrow to a subsidiary on a shared tenant. */
  appliedFacets?: Record<string, string | string[]>;
  cronGroup?: CronGroup;
}

export interface SuccessFactorsTarget {
  employer: string;
  atsType: "successfactors";
  /** Base URL of the employer's career portal, e.g. "https://careers.vestas.com" */
  careersBaseUrl: string;
  /** Defaults to "/search/" */
  searchPath?: string;
  /** Optional keyword pre-filter (let the classifier handle the rest) */
  searchText?: string;
  cronGroup?: CronGroup;
}

export interface GreenhouseTarget {
  employer: string;
  atsType: "greenhouse";
  boardToken: string;
  cronGroup?: CronGroup;
}

export interface RecruiteeTarget {
  employer: string;
  atsType: "recruitee";
  /** Company slug used in the Recruitee subdomain, e.g. "globalwindservice" */
  companySlug: string;
  cronGroup?: CronGroup;
}

export interface SoftgardenTarget {
  employer: string;
  atsType: "softgarden";
  /** Full URL to the Softgarden JSON-LD feed, e.g. "https://jobs-global.deutsche-windtechnik.com/jobs.feed.json" */
  feedUrl: string;
  cronGroup?: CronGroup;
}

/** SmartRecruiters public Postings API (no auth). D-09: lazy-fetch — list endpoint omits descriptions. */
export interface SmartRecruitersTarget {
  employer: string;
  atsType: "smartrecruiters";
  /** Company identifier used in the SmartRecruiters API path, e.g. "Vestas" */
  companyId: string;
  cronGroup?: CronGroup;
}

/** Trakstar (SPA — fragile per D-10). Token extracted from initial HTML; abort to aggregator if not parseable. */
export interface TrakstarTarget {
  employer: string;
  atsType: "trakstar";
  /** Subdomain of hire.trakstar.com, e.g. "orsted" */
  companySlug: string;
  cronGroup?: CronGroup;
}

/** Adzuna search aggregator (D-05). Sentinel `employer` field — aggregator targets are per-query, not per-employer. */
export interface AdzunaTarget {
  employer: string;
  atsType: "adzuna";
  /** ISO 3166-1 alpha-2 country code — Adzuna endpoint requires this */
  country: string;
  cronGroup?: CronGroup;
}

/** JSearch (RapidAPI) aggregator fallback (D-06). Sentinel `employer` field. */
export interface JSearchTarget {
  employer: string;
  atsType: "jsearch";
  cronGroup?: CronGroup;
}

export type AtsTarget =
  | WorkdayTarget
  | SuccessFactorsTarget
  | GreenhouseTarget
  | RecruiteeTarget
  | SoftgardenTarget
  | SmartRecruitersTarget
  | TrakstarTarget
  | AdzunaTarget
  | JSearchTarget;

export interface NicheConfig {
  id: string;
  name: string;
  tagline: string;
  domain: string;
  /** Postgres schema name in Supabase, e.g. "wind_turbine" */
  supabaseSchema: string;
  atsTargets: AtsTarget[];
  aggregatorQueries: string[];
  classificationPrompt: string;
  classificationExemplars: {
    positive: string[];
    negative: string[];
  };
  branding: {
    primaryColor: string;
    accentColor: string;
  };
}

// --- Registry ---
const registry = new Map<string, NicheConfig>();
const domainIndex = new Map<string, string>();

export function registerNiche(config: NicheConfig): void {
  registry.set(config.id, config);
  domainIndex.set(config.domain, config.id);
}

export function getNiche(id: string): NicheConfig {
  const niche = registry.get(id);
  if (!niche) throw new Error(`Unknown niche: ${id}`);
  return niche;
}

export function getAllNiches(): NicheConfig[] {
  return Array.from(registry.values());
}

export function nicheFromHost(host: string): NicheConfig {
  const hostname = host.split(":")[0] ?? host;
  const id = domainIndex.get(hostname);
  if (!id) throw new Error(`No niche configured for host: ${hostname}`);
  return getNiche(id);
}
