import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job, Employer, JobSource } from "@owljobs/schema";
import { slugFromId, prefixFromSlug } from "./slug.js";

export type JobWithEmployer = Job & { employers: Pick<Employer, "name" | "normalized_name"> | null };
export type JobDetail = Job & {
  employers: Employer | null;
  job_sources: JobSource[];
};

interface ListJobsOpts {
  page?: number | undefined;
  perPage?: number | undefined;
  country?: string | undefined;
  q?: string | undefined;
  location?: string | undefined;
  /** Multiple location patterns ORed together; takes precedence over `location` when present */
  locations?: string[] | undefined;
  keywords?: string[] | undefined;
}

export async function listJobs(
  db: SupabaseClient,
  schema: string,
  opts: ListJobsOpts = {},
): Promise<{ jobs: JobWithEmployer[]; total: number }> {
  const { page = 1, perPage = 20, country, q, location, locations, keywords } = opts;
  const offset = (page - 1) * perPage;

  let query = db
    .schema(schema)
    .from("jobs")
    .select("id, title, location, country, posted_at, canonical_url, is_sponsored, featured_until, classification_score, employer_id, employers!inner(name, normalized_name)", { count: "exact" })
    .gte("classification_score", 0.5)
    .eq("status", "active")
    .order("is_sponsored", { ascending: false })
    .order("posted_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + perPage - 1);

  if (country) query = query.eq("country", country);
  if (q) query = query.ilike("title", `%${q}%`);
  if (locations?.length) {
    const orClause = locations.map(l => `location.ilike.%${l}%`).join(",");
    query = query.or(orClause);
  } else if (location) {
    query = query.ilike("location", `%${location}%`);
  }
  if (keywords?.length) {
    const orClause = keywords.map(k => `title.ilike.%${k}%`).join(",");
    query = query.or(orClause);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const jobs = (data ?? []) as unknown as JobWithEmployer[];
  return { jobs, total: count ?? 0 };
}

export async function getJobBySlug(
  db: SupabaseClient,
  schema: string,
  slug: string,
): Promise<JobDetail | null> {
  const prefix = prefixFromSlug(slug);

  const { data, error } = await db
    .schema(schema)
    .from("jobs")
    .select("*, employers(*), job_sources(*)")
    .like("id", `${prefix}%`)
    .limit(2);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;

  const row = data.length === 1
    ? data[0]
    : data.find((j) => j.id.startsWith(prefix)) ?? data[0];

  return row as unknown as JobDetail;
}

export async function listEmployerJobs(
  db: SupabaseClient,
  schema: string,
  normalizedName: string,
  opts: { page?: number; perPage?: number } = {},
): Promise<{ jobs: JobWithEmployer[]; employer: Employer | null; total: number }> {
  const { page = 1, perPage = 20 } = opts;
  const offset = (page - 1) * perPage;

  const { data: empData } = await db
    .schema(schema)
    .from("employers")
    .select("*")
    .eq("normalized_name", normalizedName)
    .single();

  if (!empData) return { jobs: [], employer: null, total: 0 };
  const employer = empData as unknown as Employer;

  const { data, error, count } = await db
    .schema(schema)
    .from("jobs")
    .select("id, title, location, country, posted_at, canonical_url, is_sponsored, featured_until, classification_score, employer_id, employers!inner(name, normalized_name)", { count: "exact" })
    .eq("employer_id", employer.id)
    .gte("classification_score", 0.5)
    .eq("status", "active")
    .order("is_sponsored", { ascending: false })
    .order("posted_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + perPage - 1);

  if (error) throw new Error(error.message);

  const jobs = (data ?? []) as unknown as JobWithEmployer[];
  return { jobs, employer, total: count ?? 0 };
}

export async function listFeedJobs(
  db: SupabaseClient,
  schema: string,
  limit = 50,
): Promise<JobWithEmployer[]> {
  const { data, error } = await db
    .schema(schema)
    .from("jobs")
    .select("id, title, location, country, posted_at, canonical_url, is_sponsored, featured_until, classification_score, employer_id, employers!inner(name, normalized_name)")
    .gte("classification_score", 0.5)
    .eq("status", "active")
    .order("is_sponsored", { ascending: false })
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as JobWithEmployer[];
}

export async function listSitemapJobs(
  db: SupabaseClient,
  schema: string,
): Promise<Array<{ id: string; updated_at: string }>> {
  const { data, error } = await db
    .schema(schema)
    .from("jobs")
    .select("id, updated_at")
    .gte("classification_score", 0.5)
    .eq("status", "active")
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; updated_at: string }>;
}

/**
 * FEAT-01 — Active featured jobs for the niche.
 *
 * Filters: status='active' AND featured_until > NOW().
 * Uses the idx_jobs_featured index (created in migration 0007):
 *   ON wind_turbine.jobs(featured_until DESC NULLS LAST, posted_at DESC)
 *   WHERE featured_until IS NOT NULL.
 *
 * The runtime `> NOW()` filter excludes already-expired featured rows
 * (self-expiring sort per FEAT-01 spec — D-13: 30-day duration set by toggle API).
 *
 * Usage from .astro pages: listFeaturedJobs(db, niche.supabaseSchema)
 */
export async function listFeaturedJobs(
  db: SupabaseClient,
  schema: string,
  limit: number = 10,
): Promise<JobWithEmployer[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .schema(schema)
    .from("jobs")
    .select(
      "id, title, location, country, posted_at, canonical_url, apply_url, is_sponsored, featured_until, employer_id, employers!inner(name, normalized_name)",
    )
    .eq("status", "active")
    .gt("featured_until", nowIso)
    .order("featured_until", { ascending: false, nullsFirst: false })
    .order("posted_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as JobWithEmployer[];
}

export { slugFromId };

export interface JobStats {
  activeJobs: number;
  totalEmployers: number;
  newThisWeek: number;
}

export async function getStats(db: SupabaseClient, schema: string): Promise<JobStats> {
  const now = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [active, employers, recent] = await Promise.all([
    db.schema(schema).from("jobs").select("id", { count: "exact", head: true })
      .gte("classification_score", 0.5)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`),
    db.schema(schema).from("employers").select("id", { count: "exact", head: true }),
    db.schema(schema).from("jobs").select("id", { count: "exact", head: true })
      .gte("classification_score", 0.5)
      .eq("status", "active")
      .gte("posted_at", weekAgo),
  ]);

  return {
    activeJobs: active.count ?? 0,
    totalEmployers: employers.count ?? 0,
    newThisWeek: recent.count ?? 0,
  };
}

export async function listEmployers(
  db: SupabaseClient,
  schema: string,
  limit = 8,
): Promise<Array<Pick<Employer, "name" | "normalized_name">>> {
  const { data, error } = await db
    .schema(schema)
    .from("employers")
    .select("name, normalized_name")
    .order("name", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Pick<Employer, "name" | "normalized_name">>;
}
