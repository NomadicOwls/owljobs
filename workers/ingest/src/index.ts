import { createClient } from "@supabase/supabase-js";
import { getAllNiches, nicheFromHost, registerNiche } from "@owljobs/niches";
import windTurbine from "../../../niches/wind-turbine.js";
import { ingestNiche } from "./ingest.js";
import { cleanupExpired } from "./expire.js";
import { classifyPendingJobs, reclassifyAmbiguous, CLASSIFY_LIMIT } from "./classify.js";
import { enrichPendingJobs } from "./enrich.js";

// Register all niches at module load time.
// Add new niches here as they're provisioned.
registerNiche(windTurbine);

interface NicheMessage {
  nicheId: string;
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  AI: Ai;
  CLASSIFY_QUEUE: Queue<NicheMessage>;
  ENRICH_QUEUE: Queue<NicheMessage>;
  PAGES_DEPLOY_HOOK?: string;
  GOOGLE_INDEXING_KEY?: string;     // Service-account JSON blob (CONTEXT D-08); optional — skip pings if absent
  ADZUNA_APP_ID?: string;           // Adzuna aggregator (COVG-03, Phase 2)
  ADZUNA_APP_KEY?: string;          // Adzuna aggregator (COVG-03, Phase 2)
  JSEARCH_API_KEY?: string;         // JSearch (RapidAPI) aggregator fallback (COVG-03, Phase 2)
  INGEST_SECRET: string;            // Bearer token for debug endpoints (CR-01); REQUIRED — optional typing creates Bearer-undefined bypass
}

function makeSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

const handler: ExportedHandler<Env, NicheMessage> = {
  async scheduled(_event, env, ctx) {
    const supabase = makeSupabase(env);
    const niches = getAllNiches();

    ctx.waitUntil(
      Promise.allSettled(
        niches.map(async (niche) => {
          const db = supabase.schema(niche.supabaseSchema);
          try {
            const adzunaCreds = (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY)
              ? { appId: env.ADZUNA_APP_ID, appKey: env.ADZUNA_APP_KEY }
              : undefined;
            const jsearchCreds = env.JSEARCH_API_KEY ? { apiKey: env.JSEARCH_API_KEY } : undefined;
            const stats = await ingestNiche(niche, db, undefined, env.GOOGLE_INDEXING_KEY, {
              ...(adzunaCreds ? { adzuna: adzunaCreds } : {}),
              ...(jsearchCreds ? { jsearch: jsearchCreds } : {}),
            });
            console.log(
              `[${niche.id}] ingest complete: ${stats.inserted} new, ${stats.skipped} skipped, ${stats.errors} errors, ${stats.expired} expired, ${stats.pinged} pinged, ${stats.pingFailures} ping-failures`
            );
            // CONTEXT D-06: same cron handler hard-deletes 90-day-old expired rows
            try {
              const cleaned = await cleanupExpired(db);
              if (cleaned > 0) console.log(`[${niche.id}] cleanup: hard-deleted ${cleaned} jobs (>90d expired)`);
            } catch (err) {
              console.error(`[${niche.id}] cleanupExpired failed:`, err);
            }
            await env.CLASSIFY_QUEUE.send({ nicheId: niche.id });
          } catch (err) {
            console.error(`[${niche.id}] ingest failed:`, err);
          }
        })
      )
    );
  },

  async queue(batch, env) {
    const supabase = makeSupabase(env);

    await Promise.allSettled(
      batch.messages.map(async (msg) => {
        const { nicheId } = msg.body;
        const niche = getAllNiches().find((n) => n.id === nicheId);
        if (!niche) {
          console.warn(`[queue] unknown nicheId: ${nicheId}`);
          msg.ack();
          return;
        }

        const db = supabase.schema(niche.supabaseSchema);

        try {
          if (batch.queue === "owljobs-classify") {
            const stats = await classifyPendingJobs(niche, db, env.AI);
            console.log(
              `[${nicheId}] classify complete: ${stats.classified} classified, ${stats.skipped} skipped, hasMore: ${stats.hasMore}`
            );
            // If we hit the batch limit there may be more pending — chain another classify run
            if (stats.hasMore) {
              await env.CLASSIFY_QUEUE.send({ nicheId });
            }
            await env.ENRICH_QUEUE.send({ nicheId });
          } else {
            const stats = await enrichPendingJobs(niche, db, env.GOOGLE_INDEXING_KEY);
            console.log(
              `[${nicheId}] enrich complete: ${stats.enriched} enriched, ${stats.skipped} skipped, ${stats.errors} errors, ${stats.pinged} pinged, ${stats.pingFailures} ping-failures`
            );
            if (env.PAGES_DEPLOY_HOOK) {
              await fetch(env.PAGES_DEPLOY_HOOK, { method: "POST" });
              console.log(`[${nicheId}] triggered Pages rebuild`);
            }
          }
          msg.ack();
        } catch (err) {
          console.error(`[${nicheId}] ${batch.queue} failed:`, err);
          msg.retry();
        }
      })
    );
  },

  // /jobs.json and debug endpoints — production traffic goes through workers/api
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/classify-now") {
      // CR-01: Bearer auth required for all debug/operational endpoints
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${env.INGEST_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const niche = getAllNiches()[0];
      if (!niche) return new Response("No niches configured", { status: 500 });
      const db = makeSupabase(env).schema(niche.supabaseSchema);
      const stats = await classifyPendingJobs(niche, db, env.AI);
      return Response.json({ niche: niche.id, ...stats });
    }

    if (url.pathname === "/ingest-now") {
      // CR-01: Bearer auth required for all debug/operational endpoints
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${env.INGEST_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const niche = getAllNiches()[0];
      if (!niche) return new Response("No niches configured", { status: 500 });
      const db = makeSupabase(env).schema(niche.supabaseSchema);
      // ?target=N runs only that target index (0-based); omit to run all (may timeout with many targets)
      const targetParam = url.searchParams.get("target");
      const targetIndex = targetParam !== null ? parseInt(targetParam, 10) : null;
      const adzunaCreds2 = (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY)
        ? { appId: env.ADZUNA_APP_ID, appKey: env.ADZUNA_APP_KEY }
        : undefined;
      const jsearchCreds2 = env.JSEARCH_API_KEY ? { apiKey: env.JSEARCH_API_KEY } : undefined;
      const stats = await ingestNiche(niche, db, targetIndex ?? undefined, env.GOOGLE_INDEXING_KEY, {
        ...(adzunaCreds2 ? { adzuna: adzunaCreds2 } : {}),
        ...(jsearchCreds2 ? { jsearch: jsearchCreds2 } : {}),
      });
      ctx.waitUntil(env.CLASSIFY_QUEUE.send({ nicheId: niche.id }));
      return Response.json({ niche: niche.id, target: targetIndex, ...stats });
    }

    if (url.pathname === "/reclassify-ambiguous") {
      // CR-01: Bearer auth required for all debug/operational endpoints
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${env.INGEST_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const niche = getAllNiches()[0];
      if (!niche) return new Response("No niches configured", { status: 500 });
      const db = makeSupabase(env).schema(niche.supabaseSchema);
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
      const dry = url.searchParams.get("dry") === "1";
      const stats = await reclassifyAmbiguous(niche, db, env.AI, { limit, dry });
      return Response.json({ niche: niche.id, dry, ...stats });
    }

    if (url.pathname === "/enrich-now") {
      // CR-01: Bearer auth required for all debug/operational endpoints
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${env.INGEST_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const niche = getAllNiches()[0];
      if (!niche) return new Response("No niches configured", { status: 500 });
      const db = makeSupabase(env).schema(niche.supabaseSchema);
      const stats = await enrichPendingJobs(niche, db, env.GOOGLE_INDEXING_KEY);
      return Response.json({ niche: niche.id, ...stats });
    }

    if (url.pathname !== "/jobs.json") {
      return new Response("Not found", { status: 404 });
    }

    let niche = getAllNiches()[0];
    if (!niche) return new Response("No niches configured", { status: 500 });

    try {
      niche = nicheFromHost(request.headers.get("Host") ?? "");
    } catch {
      // In dev the host won't match the production domain — use the first niche
    }

    const supabase = makeSupabase(env);
    const db = supabase.schema(niche.supabaseSchema);

    const { data, error } = await db
      .from("jobs")
      .select("id, title, employer_id, location, country, posted_at, canonical_url, is_sponsored, classification_score, classifier")
      .eq("status", "active")
      .order("is_sponsored", { ascending: false })
      .order("posted_at", { ascending: false })
      .limit(100);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ niche: niche.id, count: data.length, jobs: data });
  },
};

export default handler;
