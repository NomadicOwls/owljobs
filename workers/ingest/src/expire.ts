// workers/ingest/src/expire.ts
//
// Stale-job lifecycle (DATA-01, DATA-02, DATA-03 per CONTEXT.md decisions D-01..D-09).
//
// expireMissingJobs: after a successful ATS fetch (≥1 results), diff the returned
// job IDs against currently-active DB rows for that employer. Mark absent IDs as
// expired (status='expired', expired_at=NOW()) and ping the Google Indexing API.
//
// cleanupExpired: hard-delete expired rows older than 90 days (CONTEXT D-06).
//
// Per CONTEXT D-01: SKIP expiry detection if fetchedIds is empty — could indicate
// a transient ATS outage; mass-expiry would deindex everything, then re-indexing
// would take days. Better to wait for the next cron run with real data.

import type { NicheConfig } from "@owljobs/niches";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pingUrlUpdated } from "./google-indexing.js";
import { buildPublicUrl } from "./build-public-url.js";

type SchemaClient = ReturnType<SupabaseClient["schema"]>;

export interface ExpireResult {
  marked: number;
  reactivated: number;        // Always 0 here — reactivation happens in upsertJob 23505 branch (ingest.ts)
  pinged: number;
  pingFailures: number;
  pingsSkipped: number;       // Capped per RESEARCH Pitfall 5 — Indexing API quota = 200/day default
}

const PING_BUDGET_PER_RUN = 100;
const RETENTION_DAYS = 90;

/**
 * After a successful ATS fetch for ONE employer, mark any active DB jobs
 * whose ID is missing from `fetchedJobIds` as expired, and ping Google
 * Indexing API for each.
 *
 * @param db - Schema-scoped Supabase client (already `.schema(niche.supabaseSchema)`)
 * @param employerId - sha256(normalize(employer_name)) — matches employers.id
 * @param fetchedJobIds - Set of `jobs.id` returned by THIS run's ATS fetch
 * @param saJson - Optional service-account JSON; if undefined, skip Indexing API pings
 */
export async function expireMissingJobs(
  db: SchemaClient,
  employerId: string,
  fetchedJobIds: Set<string>,
  saJson: string | undefined,
  niche: NicheConfig,
): Promise<ExpireResult> {
  // CONTEXT D-01: skip if no jobs were fetched — ATS outage guard
  if (fetchedJobIds.size === 0) {
    return { marked: 0, reactivated: 0, pinged: 0, pingFailures: 0, pingsSkipped: 0 };
  }

  // Get all currently-active jobs for this employer
  const { data: dbJobs, error } = await db
    .from("jobs")
    .select("id, canonical_url")
    .eq("employer_id", employerId)
    .eq("status", "active");
  if (error) throw new Error(`expireMissingJobs select failed: ${error.message}`);

  const toExpire = (dbJobs ?? []).filter(
    (j: { id: string }) => !fetchedJobIds.has(j.id),
  ) as Array<{ id: string; canonical_url: string }>;

  if (toExpire.length === 0) {
    return { marked: 0, reactivated: 0, pinged: 0, pingFailures: 0, pingsSkipped: 0 };
  }

  const ids = toExpire.map((j) => j.id);
  const { error: updErr } = await db
    .from("jobs")
    .update({ status: "expired", expired_at: new Date().toISOString() })
    .in("id", ids);
  if (updErr) throw new Error(`expireMissingJobs update failed: ${updErr.message}`);

  let pinged = 0;
  let pingFailures = 0;
  let pingsSkipped = 0;

  if (saJson) {
    for (const job of toExpire) {
      if (pinged + pingFailures >= PING_BUDGET_PER_RUN) {
        pingsSkipped = toExpire.length - (pinged + pingFailures);
        break;
      }
      try {
        // CR-02 fix: use owljobs.com public URL (NOT employer ATS URL / canonical_url)
        const r = await pingUrlUpdated(saJson, buildPublicUrl(niche, job.id));
        if (r.ok) pinged++;
        else pingFailures++;
      } catch (err) {
        console.warn(`[indexing] expiry ping failed for ${job.id}:`, err);
        pingFailures++;
      }
    }
  }

  return { marked: ids.length, reactivated: 0, pinged, pingFailures, pingsSkipped };
}

/**
 * Hard-delete expired rows older than 90 days (CONTEXT D-06).
 * Idempotent — safe to call every cron run.
 */
export async function cleanupExpired(db: SchemaClient): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("jobs")
    .delete()
    .eq("status", "expired")
    .lt("expired_at", cutoff)
    .select("id");
  if (error) throw new Error(`cleanupExpired failed: ${error.message}`);
  return data?.length ?? 0;
}
