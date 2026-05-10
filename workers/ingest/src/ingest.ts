import type { NicheConfig, WorkdayTarget, GreenhouseTarget, SuccessFactorsTarget, RecruiteeTarget, SoftgardenTarget } from "@owljobs/niches";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllWorkdayJobs, WorkdayAdapterError } from "@owljobs/ats-adapters/workday";
import { fetchAllGreenhouseJobs } from "@owljobs/ats-adapters/greenhouse";
import { fetchAllSuccessFactorsJobs, SuccessFactorsAdapterError } from "@owljobs/ats-adapters/successfactors";
import { fetchAllRecruiteeJobs, RecruiteeAdapterError } from "@owljobs/ats-adapters/recruitee";
import { fetchAllSoftgardenJobs, SoftgardenAdapterError } from "@owljobs/ats-adapters/softgarden";
import { sha256Hex, normalizeForKey } from "@owljobs/schema";
import { sanitizeJobDescription } from "@owljobs/ats-adapters/sanitize";
import { expireMissingJobs, type ExpireResult } from "./expire.js";
import { pingUrlUpdated } from "./google-indexing.js";

/**
 * Build the owljobs.com public URL for a job (Pitfall 8 — Indexing API requires the
 * URL it can crawl from Search Console, NOT the employer's ATS URL).
 * Slug is the first 12 chars of the job ID, matching apps/web/src/lib/slug.ts.
 */
function buildPublicUrl(niche: NicheConfig, jobId: string): string {
  return `https://${niche.domain}/jobs/${jobId.slice(0, 12)}`;
}

// Pitfall 2: Google Indexing API quota = 200/day combined across all ping types.
// expire.ts caps expiry pings at 100/run. We cap creation pings at 50/run so total
// headroom across creation + expiry + description updates stays within quota.
const CREATION_PING_BUDGET = 50;

// The `db` param is a schema-scoped Supabase client: supabase.schema(niche.supabaseSchema)
type SchemaClient = ReturnType<SupabaseClient["schema"]>;

interface IngestStats {
  inserted: number;
  skipped: number;
  errors: number;
  expired: number;
  pinged: number;
  pingFailures: number;
}

export async function ingestNiche(
  niche: NicheConfig,
  db: SchemaClient,
  onlyTargetIndex?: number,
  saJson?: string,
): Promise<IngestStats> {
  const targets = onlyTargetIndex !== undefined
    ? niche.atsTargets.slice(onlyTargetIndex, onlyTargetIndex + 1)
    : niche.atsTargets;

  // Pitfall 2: shared budget declared BEFORE targets.map so ALL targets consume from the
  // same 50-ping pool per run (not a per-target budget which would allow 9×50=450 pings).
  const budget = { remaining: CREATION_PING_BUDGET };

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const localStats: IngestStats = { inserted: 0, skipped: 0, errors: 0, expired: 0, pinged: 0, pingFailures: 0 };
      try {
        if (target.atsType === "workday") {
          await ingestWorkday(target, niche, db, localStats, saJson, budget);
        } else if (target.atsType === "greenhouse") {
          await ingestGreenhouse(target, niche, db, localStats, saJson, budget);
        } else if (target.atsType === "successfactors") {
          await ingestSuccessFactors(target, niche, db, localStats, saJson, budget);
        } else if (target.atsType === "recruitee") {
          await ingestRecruitee(target, niche, db, localStats, saJson, budget);
        } else if (target.atsType === "softgarden") {
          await ingestSoftgarden(target, niche, db, localStats, saJson, budget);
        } else {
          console.log(`[ingest] skipping unknown atsType (not yet implemented)`);
        }
      } catch (err) {
        console.error(`[ingest] error processing ${target.employer}:`, err);
        localStats.errors++;
      }
      return localStats;
    })
  );

  const stats: IngestStats = { inserted: 0, skipped: 0, errors: 0, expired: 0, pinged: 0, pingFailures: 0 };
  for (const result of results) {
    if (result.status === "fulfilled") {
      stats.inserted += result.value.inserted;
      stats.skipped += result.value.skipped;
      stats.errors += result.value.errors;
      stats.expired += result.value.expired;
      stats.pinged += result.value.pinged;
      stats.pingFailures += result.value.pingFailures;
    } else {
      stats.errors++;
    }
  }
  return stats;
}

async function ingestWorkday(
  target: WorkdayTarget,
  niche: NicheConfig,
  db: SchemaClient,
  stats: IngestStats,
  saJson?: string,
  budget?: { remaining: number },
): Promise<void> {
  let jobs;
  try {
    jobs = await fetchAllWorkdayJobs(target, target.searchText);
  } catch (err) {
    if (err instanceof WorkdayAdapterError && err.statusCode === 422) {
      console.warn(
        `[ingest] Workday 422 for ${target.employer} — verify site name at ` +
          `https://${target.tenant}.${target.instance}.myworkdayjobs.com (check network tab for CXS URL)`
      );
    }
    throw err;
  }

  const employerId = await upsertEmployer(db, {
    name: target.employer,
    atsType: "workday",
    atsTenant: target.tenant,
    atsInstance: target.instance,
    atsSite: target.site,
  });

  const fetchedJobIds = new Set<string>();
  for (const job of jobs) {
    // jobs.id is set to job.sourceId by upsertJob — accumulate the same value to match for expiry
    fetchedJobIds.add(job.sourceId);
    try {
      const inserted = await upsertJob(db, {
        id: job.sourceId,
        title: job.title,
        employerId,
        location: job.location,
        canonicalUrl: job.canonicalUrl,
        postedAt: parseWorkdayDate(job.postedOn),
        source: "workday",
        rawPayload: JSON.parse(job.rawPayload) as Record<string, unknown>,
      });
      if (inserted) {
        stats.inserted++;
        // SEO-03: ping Google Indexing API for new job URL.
        // Pitfall 8: use buildPublicUrl (owljobs.com), NOT job.canonicalUrl (employer ATS URL).
        if (saJson && budget && budget.remaining > 0) {
          try {
            const r = await pingUrlUpdated(saJson, buildPublicUrl(niche, job.sourceId));
            budget.remaining--;
            if (r.ok) stats.pinged++;
            else stats.pingFailures++;
          } catch (err) {
            console.warn(`[indexing] creation ping failed for ${job.sourceId}:`, err);
            stats.pingFailures++;
          }
        }
      } else {
        stats.skipped++;
      }
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
  }

  try {
    const r = await expireMissingJobs(db, employerId, fetchedJobIds, saJson);
    stats.expired += r.marked;
    stats.pinged += r.pinged;
    stats.pingFailures += r.pingFailures;
  } catch (err) {
    console.error(`[expire] ${target.employer}:`, err);
    stats.errors++;
  }
}

async function ingestGreenhouse(
  target: GreenhouseTarget,
  niche: NicheConfig,
  db: SchemaClient,
  stats: IngestStats,
  saJson?: string,
  budget?: { remaining: number },
): Promise<void> {
  const jobs = await fetchAllGreenhouseJobs(target);

  const employerId = await upsertEmployer(db, {
    name: target.employer,
    atsType: "greenhouse",
    atsSite: target.boardToken,
  });

  const fetchedJobIds = new Set<string>();
  for (const job of jobs) {
    // jobs.id is set to job.sourceId by upsertJob — accumulate the same value to match for expiry
    fetchedJobIds.add(job.sourceId);
    try {
      const inserted = await upsertJob(db, {
        id: job.sourceId,
        title: job.title,
        employerId,
        location: job.location,
        country: job.country,
        canonicalUrl: job.canonicalUrl,
        postedAt: job.postedOn,  // Greenhouse returns ISO timestamps — no parsing needed
        description: job.description,
        source: "greenhouse",
        rawPayload: JSON.parse(job.rawPayload) as Record<string, unknown>,
      });
      if (inserted) {
        stats.inserted++;
        // SEO-03: ping Google Indexing API for new job URL.
        // Pitfall 8: use buildPublicUrl (owljobs.com), NOT job.canonicalUrl (employer ATS URL).
        if (saJson && budget && budget.remaining > 0) {
          try {
            const r = await pingUrlUpdated(saJson, buildPublicUrl(niche, job.sourceId));
            budget.remaining--;
            if (r.ok) stats.pinged++;
            else stats.pingFailures++;
          } catch (err) {
            console.warn(`[indexing] creation ping failed for ${job.sourceId}:`, err);
            stats.pingFailures++;
          }
        }
      } else {
        stats.skipped++;
      }
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
  }

  try {
    const r = await expireMissingJobs(db, employerId, fetchedJobIds, saJson);
    stats.expired += r.marked;
    stats.pinged += r.pinged;
    stats.pingFailures += r.pingFailures;
  } catch (err) {
    console.error(`[expire] ${target.employer}:`, err);
    stats.errors++;
  }
}

async function ingestSuccessFactors(
  target: SuccessFactorsTarget,
  niche: NicheConfig,
  db: SchemaClient,
  stats: IngestStats,
  saJson?: string,
  budget?: { remaining: number },
): Promise<void> {
  let jobs;
  try {
    jobs = await fetchAllSuccessFactorsJobs(target);
  } catch (err) {
    if (err instanceof SuccessFactorsAdapterError) {
      console.warn(
        `[ingest] SuccessFactors ${err.statusCode} for ${target.employer} — verify careersBaseUrl`
      );
    }
    throw err;
  }

  const employerId = await upsertEmployer(db, {
    name: target.employer,
    atsType: "successfactors",
    careersUrl: target.careersBaseUrl,
  });

  const fetchedJobIds = new Set<string>();
  for (const job of jobs) {
    // jobs.id is set to job.sourceId by upsertJob — accumulate the same value to match for expiry
    fetchedJobIds.add(job.sourceId);
    try {
      const inserted = await upsertJob(db, {
        id: job.sourceId,
        title: job.title,
        employerId,
        location: job.location,
        canonicalUrl: job.canonicalUrl,
        postedAt: job.postedOn,  // SF adapter returns ISO timestamps already
        source: "successfactors",
        rawPayload: JSON.parse(job.rawPayload) as Record<string, unknown>,
      });
      if (inserted) {
        stats.inserted++;
        // SEO-03: ping Google Indexing API for new job URL.
        // Pitfall 8: use buildPublicUrl (owljobs.com), NOT job.canonicalUrl (employer ATS URL).
        if (saJson && budget && budget.remaining > 0) {
          try {
            const r = await pingUrlUpdated(saJson, buildPublicUrl(niche, job.sourceId));
            budget.remaining--;
            if (r.ok) stats.pinged++;
            else stats.pingFailures++;
          } catch (err) {
            console.warn(`[indexing] creation ping failed for ${job.sourceId}:`, err);
            stats.pingFailures++;
          }
        }
      } else {
        stats.skipped++;
      }
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
  }

  try {
    const r = await expireMissingJobs(db, employerId, fetchedJobIds, saJson);
    stats.expired += r.marked;
    stats.pinged += r.pinged;
    stats.pingFailures += r.pingFailures;
  } catch (err) {
    console.error(`[expire] ${target.employer}:`, err);
    stats.errors++;
  }
}

async function ingestRecruitee(
  target: RecruiteeTarget,
  niche: NicheConfig,
  db: SchemaClient,
  stats: IngestStats,
  saJson?: string,
  budget?: { remaining: number },
): Promise<void> {
  let jobs;
  try {
    jobs = await fetchAllRecruiteeJobs(target);
  } catch (err) {
    if (err instanceof RecruiteeAdapterError) {
      console.warn(`[ingest] Recruitee ${err.statusCode} for ${target.employer}`);
    }
    throw err;
  }

  const employerId = await upsertEmployer(db, {
    name: target.employer,
    atsType: "recruitee",
    careersUrl: `https://${target.companySlug}.recruitee.com`,
  });

  const fetchedJobIds = new Set<string>();
  for (const job of jobs) {
    // jobs.id is set to job.sourceId by upsertJob — accumulate the same value to match for expiry
    fetchedJobIds.add(job.sourceId);
    try {
      const inserted = await upsertJob(db, {
        id: job.sourceId,
        title: job.title,
        employerId,
        location: job.location,
        canonicalUrl: job.canonicalUrl,
        postedAt: job.postedOn,
        source: "recruitee",
        rawPayload: JSON.parse(job.rawPayload) as Record<string, unknown>,
      });
      if (inserted) {
        stats.inserted++;
        // SEO-03: ping Google Indexing API for new job URL.
        // Pitfall 8: use buildPublicUrl (owljobs.com), NOT job.canonicalUrl (employer ATS URL).
        if (saJson && budget && budget.remaining > 0) {
          try {
            const r = await pingUrlUpdated(saJson, buildPublicUrl(niche, job.sourceId));
            budget.remaining--;
            if (r.ok) stats.pinged++;
            else stats.pingFailures++;
          } catch (err) {
            console.warn(`[indexing] creation ping failed for ${job.sourceId}:`, err);
            stats.pingFailures++;
          }
        }
      } else {
        stats.skipped++;
      }
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
  }

  try {
    const r = await expireMissingJobs(db, employerId, fetchedJobIds, saJson);
    stats.expired += r.marked;
    stats.pinged += r.pinged;
    stats.pingFailures += r.pingFailures;
  } catch (err) {
    console.error(`[expire] ${target.employer}:`, err);
    stats.errors++;
  }
}

async function ingestSoftgarden(
  target: SoftgardenTarget,
  niche: NicheConfig,
  db: SchemaClient,
  stats: IngestStats,
  saJson?: string,
  budget?: { remaining: number },
): Promise<void> {
  let jobs;
  try {
    jobs = await fetchAllSoftgardenJobs(target);
  } catch (err) {
    if (err instanceof SoftgardenAdapterError) {
      console.warn(`[ingest] Softgarden ${err.statusCode} for ${target.employer} — verify feedUrl`);
    }
    throw err;
  }

  const employerId = await upsertEmployer(db, {
    name: target.employer,
    atsType: "softgarden",
    careersUrl: target.feedUrl,
  });

  const fetchedJobIds = new Set<string>();
  for (const job of jobs) {
    // jobs.id is set to job.sourceId by upsertJob — accumulate the same value to match for expiry
    fetchedJobIds.add(job.sourceId);
    try {
      const inserted = await upsertJob(db, {
        id: job.sourceId,
        title: job.title,
        employerId,
        location: job.location,
        canonicalUrl: job.canonicalUrl,
        postedAt: job.postedOn,
        description: job.description, // Softgarden feed includes descriptions inline
        source: "softgarden",
        rawPayload: JSON.parse(job.rawPayload) as Record<string, unknown>,
      });
      if (inserted) {
        stats.inserted++;
        // SEO-03: ping Google Indexing API for new job URL.
        // Pitfall 8: use buildPublicUrl (owljobs.com), NOT job.canonicalUrl (employer ATS URL).
        if (saJson && budget && budget.remaining > 0) {
          try {
            const r = await pingUrlUpdated(saJson, buildPublicUrl(niche, job.sourceId));
            budget.remaining--;
            if (r.ok) stats.pinged++;
            else stats.pingFailures++;
          } catch (err) {
            console.warn(`[indexing] creation ping failed for ${job.sourceId}:`, err);
            stats.pingFailures++;
          }
        }
      } else {
        stats.skipped++;
      }
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
  }

  try {
    const r = await expireMissingJobs(db, employerId, fetchedJobIds, saJson);
    stats.expired += r.marked;
    stats.pinged += r.pinged;
    stats.pingFailures += r.pingFailures;
  } catch (err) {
    console.error(`[expire] ${target.employer}:`, err);
    stats.errors++;
  }
}

// Workday returns relative strings like "Posted 3 Days Ago" or "Posted Today".
// Convert to an approximate ISO timestamp so Postgres accepts it.
function parseWorkdayDate(postedOn: string): string | null {
  const s = postedOn.toLowerCase();
  const now = new Date();

  if (s.includes("today") || s.includes("just posted")) {
    return now.toISOString();
  }
  if (s.includes("yesterday")) {
    now.setDate(now.getDate() - 1);
    return now.toISOString();
  }
  const daysMatch = s.match(/(\d+)\+?\s*day/);
  if (daysMatch?.[1]) {
    now.setDate(now.getDate() - parseInt(daysMatch[1], 10));
    return now.toISOString();
  }
  const monthsMatch = s.match(/(\d+)\+?\s*month/);
  if (monthsMatch?.[1]) {
    now.setMonth(now.getMonth() - parseInt(monthsMatch[1], 10));
    return now.toISOString();
  }
  // Try parsing as a real ISO date (Workday sometimes returns these too)
  const parsed = new Date(postedOn);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();

  return null;
}

// --- DB helpers ---

interface EmployerInput {
  name: string;
  atsType: "workday" | "greenhouse" | "successfactors" | "recruitee" | "softgarden" | "direct";
  atsTenant?: string;
  atsInstance?: string;
  atsSite?: string;
  careersUrl?: string;
}

async function upsertEmployer(db: SchemaClient, input: EmployerInput): Promise<string> {
  const id = await sha256Hex(normalizeForKey(input.name));

  const { error } = await db.from("employers").upsert(
    {
      id,
      name: input.name,
      normalized_name: normalizeForKey(input.name),
      ats_type: input.atsType,
      ats_tenant: input.atsTenant ?? null,
      ats_instance: input.atsInstance ?? null,
      ats_site: input.atsSite ?? null,
      careers_url: input.careersUrl ?? null,
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(`upsertEmployer failed: ${error.message}`);
  return id;
}

interface JobInput {
  id: string;
  title: string;
  employerId: string;
  location?: string | null;
  country?: string | null;
  canonicalUrl: string;
  postedAt?: string | null;
  description?: string | null;
  source: "workday" | "greenhouse" | "successfactors" | "recruitee" | "softgarden" | "adzuna" | "jsearch";
  rawPayload: Record<string, unknown>;
}

// Returns true if a new job row was inserted, false if it already existed.
async function upsertJob(db: SchemaClient, input: JobInput): Promise<boolean> {
  const discoveredId = await sha256Hex(input.canonicalUrl);

  // Staging record — always write, idempotent
  await db.from("discovered_jobs").upsert(
    {
      id: discoveredId,
      source: input.source,
      source_url: input.canonicalUrl,
      raw_payload: input.rawPayload,
      employer_hint: input.employerId,
      resolved_job_id: input.id,
    },
    { onConflict: "id" }
  );

  // For direct ATS sources, promote straight to the jobs table
  const { error, data } = await db
    .from("jobs")
    .insert({
      id: input.id,
      title: input.title,
      employer_id: input.employerId,
      location: input.location ?? null,
      country: input.country ?? null,
      posted_at: input.postedAt ?? null,
      canonical_url: input.canonicalUrl,
      description: input.description ? sanitizeJobDescription(input.description) : null,
    })
    .select("id");

  // Unique constraint violation = already exists; treat as skipped, not an error
  if (error) {
    if (error.code === "23505") {
      // Backfill description if we have one and the stored row doesn't
      if (input.description) {
        await db.from("jobs").update({ description: sanitizeJobDescription(input.description) }).eq("id", input.id).is("description", null);
      }
      // CONTEXT D-05: if existing row was expired (came back in the ATS feed), re-activate it.
      // The .eq("status", "expired") filter makes this a no-op for already-active rows.
      await db
        .from("jobs")
        .update({ status: "active", expired_at: null })
        .eq("id", input.id)
        .eq("status", "expired");
      return false;
    }
    throw new Error(`upsertJob failed: ${error.message}`);
  }

  const inserted = (data?.length ?? 0) > 0;

  if (inserted) {
    const sourceId = await sha256Hex(`${input.id}:${input.source}`);
    await db.from("job_sources").upsert(
      {
        id: sourceId,
        job_id: input.id,
        source: input.source,
        source_url: input.canonicalUrl,
      },
      { onConflict: "id" }
    );
  }

  return inserted;
}
