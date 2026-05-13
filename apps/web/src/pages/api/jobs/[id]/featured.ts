import type { APIContext } from "astro";
import { getEnv } from "../../../../lib/env.js";
import { supabaseAdmin } from "../../../../lib/supabase.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function getSessionEmployerId(
  locals: APIContext["locals"],
): Promise<string | null> {
  // Phase 4: Astro.locals.session is populated by middleware in plan 07.
  // Until plan 07 lands, this will be null for all requests and the endpoint returns 401 —
  // which is correct for the IDOR threat model (T-04-11). The dashboard wires this up in plan 08.
  const session =
    (locals as unknown as { session?: { user?: { app_metadata?: Record<string, unknown> } } })
      .session ?? null;
  if (!session) return null;
  const appMetaEmployerId = session.user?.app_metadata?.employer_id;
  return typeof appMetaEmployerId === "string" && appMetaEmployerId.length > 0
    ? appMetaEmployerId
    : null;
}

export async function POST({ params, locals, request }: APIContext) {
  return handle(params.id, locals, "feature", request);
}

export async function DELETE({ params, locals, request }: APIContext) {
  return handle(params.id, locals, "unfeature", request);
}

async function handle(
  jobId: string | undefined,
  locals: APIContext["locals"],
  defaultAction: "feature" | "unfeature",
  request: Request,
) {
  if (!jobId) return Response.json({ error: "Missing job id" }, { status: 400 });

  const niche = locals.niche;
  const env = getEnv(locals);
  const employerId = await getSessionEmployerId(locals);
  if (!employerId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Allow POST body { action: "unfeature" } to override the default for the POST route
  let action: "feature" | "unfeature" = defaultAction;
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { action?: string };
      if (body?.action === "unfeature") action = "unfeature";
    } catch {
      // empty body -> keep defaultAction = "feature"
    }
  }

  const db = supabaseAdmin(env);

  // T-04-11 IDOR check #1: load the row to verify ownership; 404 if not found
  const { data: existing, error: lookupError } = await db
    .schema(niche.supabaseSchema)
    .from("jobs")
    .select("id, employer_id")
    .eq("id", jobId)
    .single();

  if (lookupError || !existing) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }
  if (existing.employer_id !== employerId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const newFeaturedUntil =
    action === "feature"
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

  // T-04-11 IDOR check #2 (belt-and-suspenders): include employer_id in the UPDATE
  const { error: updateError } = await db
    .schema(niche.supabaseSchema)
    .from("jobs")
    .update({ featured_until: newFeaturedUntil })
    .eq("id", jobId)
    .eq("employer_id", employerId);

  if (updateError) {
    console.error("[featured] update failed", updateError);
    return Response.json({ error: "Update failed." }, { status: 500 });
  }

  return Response.json({ ok: true, featured_until: newFeaturedUntil }, { status: 200 });
}
