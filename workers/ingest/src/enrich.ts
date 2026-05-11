import type { NicheConfig } from "@owljobs/niches";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDescription } from "./fetch-description.js";
import { pingUrlUpdated } from "./google-indexing.js";
import { buildPublicUrl } from "./build-public-url.js";

type SchemaClient = ReturnType<SupabaseClient["schema"]>;

export interface EnrichStats {
  enriched: number;
  skipped: number;
  errors: number;
  pinged: number;
  pingFailures: number;
}

// Pitfall 2: Indexing API quota cap. Total across all 3 ping sites <= 200/day.
const DESCRIPTION_PING_BUDGET = 50;

const ENRICH_BATCH = 60;
const ENRICH_CONCURRENCY = 8;

export async function enrichPendingJobs(
  niche: NicheConfig,
  db: SchemaClient,
  saJson?: string,
): Promise<EnrichStats> {
  const stats: EnrichStats = { enriched: 0, skipped: 0, errors: 0, pinged: 0, pingFailures: 0 };
  const budget = { remaining: DESCRIPTION_PING_BUDGET };

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
            // SEO-03: ping Google Indexing API after description fills in (D-19).
            // Pitfall 8: owljobs.com URL via buildPublicUrl, NOT row.canonical_url.
            if (saJson && budget.remaining > 0) {
              try {
                const r = await pingUrlUpdated(saJson, buildPublicUrl(niche, row.id));
                budget.remaining--;
                if (r.ok) stats.pinged++;
                else stats.pingFailures++;
              } catch (err) {
                console.warn(`[indexing] description-update ping failed for ${row.id}:`, err);
                stats.pingFailures++;
              }
            }
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
