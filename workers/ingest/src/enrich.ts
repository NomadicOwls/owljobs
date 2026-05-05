import type { NicheConfig } from "@owljobs/niches";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWorkdayJobDescription } from "@owljobs/ats-adapters/workday";
import { fetchSuccessFactorsJobDescription } from "@owljobs/ats-adapters/successfactors";
import { fetchRecruiteeJobDescription } from "@owljobs/ats-adapters/recruitee";

type SchemaClient = ReturnType<SupabaseClient["schema"]>;

export interface EnrichStats {
  enriched: number;
  skipped: number;
  errors: number;
}

const ENRICH_BATCH = 60;
const ENRICH_CONCURRENCY = 8;

export async function enrichPendingJobs(
  _niche: NicheConfig,
  db: SchemaClient
): Promise<EnrichStats> {
  const stats: EnrichStats = { enriched: 0, skipped: 0, errors: 0 };

  const { data, error } = await db
    .from("jobs")
    .select("id, canonical_url, employers!inner(ats_type, ats_tenant, ats_instance, ats_site)")
    .is("description", null)
    .gte("classification_score", 0.5)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(ENRICH_BATCH);

  if (error) {
    console.error("[enrich] query failed:", error);
    stats.errors++;
    return stats;
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    canonical_url: string;
    employers: {
      ats_type: string;
      ats_tenant: string | null;
      ats_instance: string | null;
      ats_site: string | null;
    };
  }>;

  for (let i = 0; i < rows.length; i += ENRICH_CONCURRENCY) {
    const chunk = rows.slice(i, i + ENRICH_CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async (row) => {
        try {
          const description = await fetchDescription(row);
          if (!description) {
            stats.skipped++;
            return;
          }

          const { error: updateErr } = await db
            .from("jobs")
            .update({ description })
            .eq("id", row.id);

          if (updateErr) {
            console.error(`[enrich] update failed for ${row.id}:`, updateErr);
            stats.errors++;
          } else {
            stats.enriched++;
          }
        } catch (err) {
          console.error(`[enrich] error enriching ${row.id}:`, err);
          stats.errors++;
        }
      })
    );
  }

  return stats;
}

async function fetchDescription(row: {
  id: string;
  canonical_url: string;
  employers: {
    ats_type: string;
    ats_tenant: string | null;
    ats_instance: string | null;
    ats_site: string | null;
  };
}): Promise<string | null> {
  const { ats_type, ats_tenant, ats_instance, ats_site } = row.employers;

  if (ats_type === "workday" && ats_tenant && ats_instance && ats_site) {
    // canonical_url: https://{tenant}.{instance}.myworkdayjobs.com/{site}/job/...
    // externalPath = /job/... (everything after /{site})
    const basePrefix = `https://${ats_tenant}.${ats_instance}.myworkdayjobs.com/${ats_site}`;
    if (!row.canonical_url.startsWith(basePrefix)) return null;
    const externalPath = row.canonical_url.slice(basePrefix.length);

    return fetchWorkdayJobDescription(
      { employer: "", atsType: "workday", tenant: ats_tenant, instance: ats_instance, site: ats_site },
      externalPath
    );
  }

  if (ats_type === "successfactors") {
    return fetchSuccessFactorsJobDescription(row.canonical_url);
  }

  if (ats_type === "recruitee") {
    return fetchRecruiteeJobDescription(row.canonical_url);
  }

  // Greenhouse / softgarden: descriptions set eagerly at ingest from API response; no re-fetch needed.
  return null;
}
