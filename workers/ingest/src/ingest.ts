import type { NicheConfig, WorkdayTarget, GreenhouseTarget, SuccessFactorsTarget, RecruiteeTarget, SoftgardenTarget } from "@owljobs/niches";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllWorkdayJobs, WorkdayAdapterError } from "@owljobs/ats-adapters/workday";
import { fetchAllGreenhouseJobs } from "@owljobs/ats-adapters/greenhouse";
import { fetchAllSuccessFactorsJobs, SuccessFactorsAdapterError } from "@owljobs/ats-adapters/successfactors";
import { fetchAllRecruiteeJobs, RecruiteeAdapterError } from "@owljobs/ats-adapters/recruitee";
import { fetchAllSoftgardenJobs, SoftgardenAdapterError } from "@owljobs/ats-adapters/softgarden";
import { sha256Hex, normalizeForKey } from "@owljobs/schema";

// The `db` param is a schema-scoped Supabase client: supabase.schema(niche.supabaseSchema)
type SchemaClient = ReturnType<SupabaseClient["schema"]>;

interface IngestStats {
  inserted: number;
  skipped: number;
  errors: number;
}

export async function ingestNiche(niche: NicheConfig, db: SchemaClient, onlyTargetIndex?: number): Promise<IngestStats> {
  const targets = onlyTargetIndex !== undefined
    ? niche.atsTargets.slice(onlyTargetIndex, onlyTargetIndex + 1)
    : niche.atsTargets;

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const localStats: IngestStats = { inserted: 0, skipped: 0, errors: 0 };
      try {
        if (target.atsType === "workday") {
          await ingestWorkday(target, db, localStats);
        } else if (target.atsType === "greenhouse") {
          await ingestGreenhouse(target, db, localStats);
        } else if (target.atsType === "successfactors") {
          await ingestSuccessFactors(target, db, localStats);
        } else if (target.atsType === "recruitee") {
          await ingestRecruitee(target, db, localStats);
        } else if (target.atsType === "softgarden") {
          await ingestSoftgarden(target, db, localStats);
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

  const stats: IngestStats = { inserted: 0, skipped: 0, errors: 0 };
  for (const result of results) {
    if (result.status === "fulfilled") {
      stats.inserted += result.value.inserted;
      stats.skipped += result.value.skipped;
      stats.errors += result.value.errors;
    } else {
      stats.errors++;
    }
  }
  return stats;
}

async function ingestWorkday(
  target: WorkdayTarget,
  db: SchemaClient,
  stats: IngestStats
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

  for (const job of jobs) {
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
      inserted ? stats.inserted++ : stats.skipped++;
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
  }
}

async function ingestGreenhouse(
  target: GreenhouseTarget,
  db: SchemaClient,
  stats: IngestStats
): Promise<void> {
  const jobs = await fetchAllGreenhouseJobs(target);

  const employerId = await upsertEmployer(db, {
    name: target.employer,
    atsType: "greenhouse",
    atsSite: target.boardToken,
  });

  for (const job of jobs) {
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
      inserted ? stats.inserted++ : stats.skipped++;
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
  }
}

async function ingestSuccessFactors(
  target: SuccessFactorsTarget,
  db: SchemaClient,
  stats: IngestStats
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

  for (const job of jobs) {
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
      inserted ? stats.inserted++ : stats.skipped++;
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
  }
}

async function ingestRecruitee(
  target: RecruiteeTarget,
  db: SchemaClient,
  stats: IngestStats
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

  for (const job of jobs) {
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
      inserted ? stats.inserted++ : stats.skipped++;
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
  }
}

async function ingestSoftgarden(
  target: SoftgardenTarget,
  db: SchemaClient,
  stats: IngestStats
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

  for (const job of jobs) {
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
      inserted ? stats.inserted++ : stats.skipped++;
    } catch (err) {
      console.error(`[ingest] failed to upsert job "${job.title}":`, err);
      stats.errors++;
    }
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
      description: input.description ?? null,
    })
    .select("id");

  // Unique constraint violation = already exists; treat as skipped, not an error
  if (error) {
    if (error.code === "23505") {
      // Backfill description if we have one and the stored row doesn't
      if (input.description) {
        await db.from("jobs").update({ description: input.description }).eq("id", input.id).is("description", null);
      }
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
