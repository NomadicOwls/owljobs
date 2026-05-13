// TypeScript types mirroring the Postgres schema.
// All timestamps are ISO-8601 strings (Supabase returns them as strings over the REST API).

export interface Employer {
  id: string;
  name: string;
  normalized_name: string;
  slug: string;
  domain: string | null;
  ats_type: "workday" | "greenhouse" | "successfactors" | "direct";
  ats_tenant: string | null;
  ats_instance: string | null;
  ats_site: string | null;
  careers_url: string | null;
  billing_email: string | null;
  plan: "featured" | "subscription" | null;
  created_at: string;
}

export interface DiscoveredJob {
  id: string;
  source: "workday" | "greenhouse" | "adzuna" | "jsearch";
  source_url: string;
  raw_payload: Record<string, unknown> | null;
  employer_hint: string | null;
  resolved_job_id: string | null;
  discovered_at: string;
}

export interface Job {
  id: string;
  title: string;
  employer_id: string;
  location: string | null;
  country: string | null;
  posted_at: string | null;
  expires_at: string | null;           // Employer-stated closing date. KEEP. See 0001_initial.sql.
  status: "active" | "expired";        // Stale-job lifecycle — added by migration 0004
  expired_at: string | null;           // Our soft-delete detection timestamp — added by migration 0004
  description: string | null;
  canonical_url: string;
  apply_url: string | null;
  direct_apply: boolean;
  is_sponsored: boolean;
  featured_until: string | null;
  embedding: number[] | null;          // vector(384) — bge-small-en
  classification_score: number | null;
  classifier: "embedding" | "llm" | "manual" | null;
  created_at: string;
  updated_at: string;
}

export interface JobSource {
  id: string;
  job_id: string;
  source: string;
  source_url: string;
  first_seen_at: string;
}

export interface Subscriber {
  id: string;
  email: string;
  niche: string;
  locations: string[] | null;
  confirmed_at: string | null;
  confirmation_token: string | null;
  unsubscribe_token: string;
  created_at: string;
  consent_given_at: string | null;     // GDPR Art 7 consent timestamp — added by migration 0004
}

export interface EmailSend {
  id: string;
  subscriber_id: string;
  sent_at: string;
  jobs_count: number;
}

// Utility: normalize a string for dedup key construction
export function normalizeForKey(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

// Utility: SHA-256 hex digest (Web Crypto API — works in Workers + Node 23+)
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
