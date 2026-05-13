import type { APIContext } from "astro";
import { getEnv } from "../../lib/env.js";

function isSafeRedirect(url: string): boolean {
  // Allow same-origin paths but reject protocol-relative URLs (//evil.com bypass — T-04-22)
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET({ request, locals, redirect }: APIContext) {
  const niche = locals.niche;
  const env = getEnv(locals);
  const url = new URL(request.url);

  const jobId = url.searchParams.get("job") ?? "";
  const type = url.searchParams.get("type") ?? "view";
  const employerId = url.searchParams.get("employer") ?? "";
  const redirectTarget = url.searchParams.get("redirect");

  if (!jobId) {
    return Response.json({ error: "Missing job id" }, { status: 400 });
  }

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
    if (!redirectTarget) {
      return Response.json({ error: "Missing redirect target" }, { status: 400 });
    }
    if (!isSafeRedirect(redirectTarget)) {
      return Response.json({ error: "Invalid redirect target" }, { status: 400 });
    }
    return redirect(redirectTarget, 302);
  }

  return new Response(null, { status: 204 });
}
