/**
 * workers/discover — ATS Auto-Discovery Worker (COVG-01)
 *
 * POST /probe — Probes all public.candidates rows with status='pending',
 * detects ATS platform signatures, writes results back.
 *
 * Authorization: Bearer {DISCOVER_SECRET} required on all requests.
 */
import { createClient } from "@supabase/supabase-js";

interface Env {
  DISCOVER_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface Candidate {
  id: string;
  name: string;
  careers_url: string;
  status: string;
}

interface DetectionResult {
  ats_type: string | null;
  confidence: number;
  status: "detected" | "unknown" | "error";
}

// ATS signature patterns — D-04
// Each entry: { platform, patterns } where patterns are checked against fetched HTML + URLs
// Domains: workday.com, boards.greenhouse.io, jobs.lever.co, jobs.smartrecruiters.com,
//          recruitee.com, softgarden.io, jobs.ashbyhq.com, icims.com
const ATS_SIGNATURES: Array<{ platform: string; patterns: RegExp[] }> = [
  { platform: "workday",         patterns: [/\/wday\//i, /workday\.com/i] },
  { platform: "greenhouse",      patterns: [/boards\.greenhouse\.io/i, /\/boards\//i] },
  { platform: "lever",           patterns: [/jobs\.lever\.co/i] },
  { platform: "smartrecruiters", patterns: [/jobs\.smartrecruiters\.com/i, /smartrecruiters\.com/i] },
  { platform: "recruitee",       patterns: [/\.recruitee\.com/i] },
  { platform: "softgarden",      patterns: [/\.softgarden\.io/i] },
  { platform: "ashby",           patterns: [/jobs\.ashbyhq\.com/i] },
  { platform: "icims",           patterns: [/\.icims\.com/i, /icims\.com/i] },
];

/**
 * Detect ATS from fetched career page content.
 * Returns the first matching ATS with tiered confidence:
 *   Tier 1: URL match — confidence: 1.0 (exact redirect/URL match)
 *   Tier 2: href/src in HTML — confidence: 0.8 (linked domain found)
 *   Tier 3: inline text reference — confidence: 0.6 (pattern in page body text only)
 */
function detectAts(html: string, finalUrl: string): DetectionResult {
  for (const sig of ATS_SIGNATURES) {
    // Tier 1: pattern found in final response URL (confidence: 1.0)
    for (const p of sig.patterns) {
      if (p.test(finalUrl)) {
        return { ats_type: sig.platform, confidence: 1.0, status: "detected" };
      }
    }
    // Tier 2 / Tier 3: pattern found in page HTML
    for (const p of sig.patterns) {
      if (p.test(html)) {
        // Distinguish href/src attribute reference (confidence: 0.8)
        // vs inline text body reference (confidence: 0.6)
        const inAttribute =
          new RegExp(`href=["'][^"']*${p.source}[^"']*["']`, "i").test(html) ||
          new RegExp(`src=["'][^"']*${p.source}[^"']*["']`, "i").test(html);
        return {
          ats_type: sig.platform,
          confidence: inAttribute ? 0.8 : 0.6,
          status: "detected",
        };
      }
    }
  }
  return { ats_type: null, confidence: 0, status: "unknown" };
}

async function probeCandidate(candidate: Candidate): Promise<DetectionResult> {
  try {
    const response = await fetch(candidate.careers_url, {
      redirect: "follow",
      headers: { "User-Agent": "OwlJobs-Discover/1.0 (+https://mywindturbinejobs.com/about)" },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    return detectAts(html, response.url);
  } catch (_err) {
    return { ats_type: null, confidence: 0, status: "error" };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Authorization check — MUST be first gate before any DB access
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.DISCOVER_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (request.method !== "POST" || new URL(request.url).pathname !== "/probe") {
      return new Response("Not Found", { status: 404 });
    }

    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch all pending candidates (status = 'pending')
    const { data: candidates, error } = await db
      .from("candidates")
      .select("id, name, careers_url, status")
      .eq("status", "pending");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results: Array<{ id: string; name: string } & DetectionResult> = [];

    for (const candidate of (candidates ?? []) as Candidate[]) {
      const result = await probeCandidate(candidate);
      // Write result back to candidates table
      await db
        .from("candidates")
        .update({
          ats_type: result.ats_type,
          confidence: result.confidence,
          probed_at: new Date().toISOString(),
          status: result.status,
        })
        .eq("id", candidate.id);
      results.push({ id: candidate.id, name: candidate.name, ...result });
    }

    return new Response(
      JSON.stringify({ probed: results.length, results }, null, 2),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  },
};
