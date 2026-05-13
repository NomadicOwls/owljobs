import type { APIContext } from "astro";
import { getEnv } from "../../lib/env.js";
import { supabasePublic } from "../../lib/supabase.js";

const VALID_TYPES = new Set(["view", "click", "apply"]);
const EMPLOYER_ID_RE = /^[a-f0-9]{64}$/;

export async function GET({ request, locals, redirect }: APIContext) {
  const niche = locals.niche;
  const env = getEnv(locals);
  const url = new URL(request.url);

  const jobId = url.searchParams.get("job") ?? "";
  const rawType = url.searchParams.get("type") ?? "view";
  const rawEmployerId = url.searchParams.get("employer") ?? "";

  if (!jobId) {
    return Response.json({ error: "Missing job id" }, { status: 400 });
  }

  // Validate blobs before writing to Analytics Engine (WR-03)
  const type = VALID_TYPES.has(rawType) ? rawType : "view";
  const employerId = EMPLOYER_ID_RE.test(rawEmployerId) ? rawEmployerId : "";

  // Pitfall 4 — local dev does not simulate Analytics Engine
  const analytics = (env as { ANALYTICS?: AnalyticsEngineDataset }).ANALYTICS;
  if (analytics && typeof analytics.writeDataPoint === "function") {
    try {
      analytics.writeDataPoint({
        blobs: [jobId, type, niche.id, employerId],
        doubles: [1],
        indexes: [jobId],
      });
    } catch {
      // writeDataPoint is documented as fire-and-forget; swallow defensively
    }
  }

  if (type === "apply") {
    // BL-02: never redirect to a client-supplied URL — fetch apply_url from DB
    const db = supabasePublic(env);
    const { data: job } = await db
      .schema(niche.supabaseSchema)
      .from("jobs")
      .select("apply_url, canonical_url")
      .eq("id", jobId)
      .single();
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }
    const dest = job.apply_url ?? job.canonical_url;
    if (!dest) {
      return Response.json({ error: "No apply URL" }, { status: 404 });
    }
    return redirect(dest, 302);
  }

  return new Response(null, { status: 204 });
}
