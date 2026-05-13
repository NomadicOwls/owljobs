import type { APIContext } from "astro";
import { getEnv } from "../../lib/env.js";

const EMPLOYER_ID_RE = /^[a-f0-9]{64}$/;

interface AeRow {
  job_id: string;
  event_type: string;
  count: number;
}

export async function GET({ locals, url }: APIContext) {
  const niche = locals.niche;
  const session = locals.session;
  const employerIdSession = locals.employerId;

  // Auth: must be a logged-in employer
  if (!session || !employerIdSession) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Allow the query string to scope to a specific employer ONLY if it matches the session's
  // employer_id (prevents IDOR). Default to the session's employer_id otherwise.
  const requested = url.searchParams.get("employer_id") ?? employerIdSession;
  if (requested !== employerIdSession) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pitfall 5 — CF Analytics Engine SQL API has no parameterized queries.
  // employer_id is a SHA-256 hex string (64 hex chars). Validate before embedding.
  if (!EMPLOYER_ID_RE.test(requested)) {
    return Response.json({ error: "Invalid employer_id" }, { status: 400 });
  }

  // Also validate niche.id is alphanumeric+hyphen only (defence-in-depth)
  if (!/^[a-z0-9-]{1,64}$/.test(niche.id)) {
    return Response.json({ error: "Invalid niche" }, { status: 500 });
  }

  const env = getEnv(locals);
  const sql = `
    SELECT blob1 AS job_id,
           blob2 AS event_type,
           SUM(_sample_interval) AS count
      FROM owljobs_events
     WHERE blob3 = '${niche.id}'
       AND blob4 = '${requested}'
       AND timestamp >= NOW() - INTERVAL '30' DAY
     GROUP BY blob1, blob2
     FORMAT JSON
  `;

  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
          "Content-Type": "text/plain",
        },
        body: sql,
      },
    );
    if (!resp.ok) {
      return Response.json({ views: 0, clicks: 0, applies: 0, perJob: {}, error: "CF API error" }, { status: 200 });
    }
    const json = (await resp.json()) as { data?: AeRow[] };
    const rows = json?.data ?? [];

    let views = 0, clicks = 0, applies = 0;
    const perJob: Record<string, { views: number; clicks: number; applies: number }> = {};
    for (const row of rows) {
      const j = perJob[row.job_id] ?? (perJob[row.job_id] = { views: 0, clicks: 0, applies: 0 });
      if (row.event_type === "view") { views += row.count; j.views += row.count; }
      else if (row.event_type === "click") { clicks += row.count; j.clicks += row.count; }
      else if (row.event_type === "apply") { applies += row.count; j.applies += row.count; }
    }

    return Response.json({ views, clicks, applies, perJob }, { status: 200 });
  } catch {
    return Response.json({ views: 0, clicks: 0, applies: 0, perJob: {} }, { status: 200 });
  }
}
