import { createClient } from "@supabase/supabase-js";
import { getAllNiches, registerNiche, type NicheConfig } from "@owljobs/niches";
import windTurbine from "../../../niches/wind-turbine.js";

// Register all niches at module load time.
// Add new niches here as they are provisioned.
registerNiche(windTurbine);

// --- Types ---

interface DigestMessage {
  nicheId: string;
  subscriberIds: string[];
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  RESEND_API_KEY: string;
  DIGEST_QUEUE: Queue<DigestMessage>;
}

interface SubscriberRow {
  id: string;
  email: string;
  locations: string[] | null;
  unsubscribe_token: string;
  confirmed_at: string | null;
}

interface JobRow {
  id: string;
  title: string;
  employer_id: string;
  location: string | null;
  canonical_url: string;
  apply_url: string | null;
  posted_at: string | null;
}

interface EmployerRow {
  id: string;
  name: string;
}

// --- Constants ---

const BATCH_SIZE = 10;                                                      // D-15: 10 subscribers per queue message
const MAX_JOBS_PER_DIGEST = 20;                                             // D-06
const DIGEST_WINDOW_DAYS = 7;                                               // D-01: prior 7-day window
const FROM_ADDRESS = "Wind Turbine Jobs <digest@windturbinejobs.com>";      // D-09

// --- Helpers ---

function makeSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

function htmlEncode(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyLocationFilter(jobs: JobRow[], sub: SubscriberRow): JobRow[] {
  // D-02: if locations is null/empty -> send all; otherwise case-insensitive substring match
  if (!Array.isArray(sub.locations) || sub.locations.length === 0) return jobs;
  const needles = sub.locations.map((l) => l.toLowerCase());
  return jobs.filter((j) => {
    const hay = (j.location ?? "").toLowerCase();
    return needles.some((n) => hay.includes(n));
  });
}

function buildUnsubscribeUrl(niche: NicheConfig, token: string): string {
  return `https://${niche.domain}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

function buildSubject(jobCount: number, niche: NicheConfig): string {
  // D-08: dynamic subject with job count
  if (jobCount > 0) {
    return `${jobCount} new wind turbine jobs this week`;
  }
  return `${niche.name} — no new listings this week`;
}

function renderDigestHtml(
  jobs: JobRow[],
  sub: SubscriberRow,
  niche: NicheConfig,
  employerNameById: Map<string, string>,
): string {
  // D-05: simple HTML, branded header, job cards, plain-text multipart fallback (rendered separately)
  const unsubUrl = buildUnsubscribeUrl(niche, sub.unsubscribe_token);
  const accent = niche.branding.primaryColor;

  const header = `
    <div style="background:${accent};color:#fff;padding:16px 20px;font-family:Arial,sans-serif;">
      <h1 style="margin:0;font-size:20px;">${htmlEncode(niche.name)}</h1>
      <div style="opacity:.85;font-size:13px;">${htmlEncode(niche.tagline)}</div>
    </div>
  `;

  let body: string;
  if (jobs.length === 0) {
    body = `
      <p style="font-family:Arial,sans-serif;font-size:15px;color:#222;">
        No new wind turbine jobs were posted this week. We'll keep watching and send the next batch on Monday.
      </p>
    `;
  } else {
    const cards = jobs
      .map((j) => {
        // D-07: title, company, location, apply link only — no salary, no posted date
        const company = htmlEncode(employerNameById.get(j.employer_id) ?? "");
        const location = htmlEncode(j.location ?? "");
        const applyHref = j.apply_url ?? j.canonical_url;
        return `
          <div style="border:1px solid #e5e5e5;border-radius:6px;padding:14px 16px;margin:12px 0;font-family:Arial,sans-serif;">
            <div style="font-size:16px;font-weight:600;color:#111;">${htmlEncode(j.title)}</div>
            <div style="font-size:13px;color:#555;margin-top:4px;">${company}${company && location ? " · " : ""}${location}</div>
            <a href="${htmlEncode(applyHref)}" style="display:inline-block;margin-top:10px;padding:8px 14px;background:${accent};color:#fff;text-decoration:none;border-radius:4px;font-size:13px;">Apply</a>
          </div>
        `;
      })
      .join("");
    body = `<div style="padding:16px 20px;">${cards}</div>`;
  }

  const footer = `
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 20px;" />
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#666;padding:0 20px 24px 20px;">
      You're receiving this because you subscribed at ${htmlEncode(niche.domain)}.
      <a href="${htmlEncode(unsubUrl)}" style="color:#666;">Unsubscribe</a> | © 2026 ${htmlEncode(niche.name)}.
    </p>
  `;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f7f7;">${header}${body}${footer}</body></html>`;
}

function renderDigestText(jobs: JobRow[], sub: SubscriberRow, niche: NicheConfig): string {
  // D-05: plain-text multipart fallback
  const unsubUrl = buildUnsubscribeUrl(niche, sub.unsubscribe_token);
  if (jobs.length === 0) {
    return [
      `${niche.name}`,
      ``,
      `No new wind turbine jobs were posted this week.`,
      `We'll keep watching and send the next batch on Monday.`,
      ``,
      `Unsubscribe: ${unsubUrl}`,
    ].join("\n");
  }
  const lines = jobs.map((j) => `- ${j.title} — ${j.apply_url ?? j.canonical_url}`);
  return [
    `${niche.name} — this week's jobs`,
    ``,
    ...lines,
    ``,
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");
}

// --- Worker handler ---

const handler: ExportedHandler<Env, DigestMessage> = {
  // Cron producer — Monday 06:00 UTC (D-04). Paginates confirmed subscribers,
  // enqueues one DIGEST_QUEUE message per 10 IDs. All work in ctx.waitUntil()
  // because the cron handler has a 30s CPU cap (CLAUDE.md hard rule).
  async scheduled(_event, env, ctx) {
    const supabase = makeSupabase(env);
    const niches = getAllNiches();

    ctx.waitUntil(
      Promise.allSettled(
        niches.map(async (niche) => {
          const db = supabase.schema(niche.supabaseSchema);
          try {
            let offset = 0;
            while (true) {
              const { data, error } = await db
                .from("subscribers")
                .select("id")
                .not("confirmed_at", "is", null) // Pitfall 2 — exclude soft-unsubscribed
                .order("id", { ascending: true })   // CR-02: stable cursor for pagination
                .range(offset, offset + BATCH_SIZE - 1);
              if (error) {
                console.error(`[${niche.id}] subscriber enumeration failed:`, error);
                break;
              }
              if (!data || data.length === 0) break;
              await env.DIGEST_QUEUE.send({
                nicheId: niche.id,
                subscriberIds: data.map((r) => r.id as string),
              });
              if (data.length < BATCH_SIZE) break;
              offset += BATCH_SIZE;
            }
          } catch (err) {
            console.error(`[${niche.id}] digest scheduled failed:`, err);
          }
        }),
      ),
    );
  },

  // Queue consumer — fetches jobs, applies location filter per subscriber,
  // inserts email_sends row BEFORE adding to Resend batch (Pitfall 1 / CAND-03),
  // sends a single POST to https://api.resend.com/emails/batch per invocation.
  async queue(batch, env) {
    const supabase = makeSupabase(env);

    await Promise.allSettled(
      batch.messages.map(async (msg) => {
        const { nicheId, subscriberIds } = msg.body;

        // Tampering mitigation (T-03-03): validate nicheId against the registry.
        const niche = getAllNiches().find((n) => n.id === nicheId);
        if (!niche) {
          console.warn(`[digest] unknown nicheId: ${nicheId}`);
          msg.ack();
          return;
        }

        const db = supabase.schema(niche.supabaseSchema);

        try {
          // Fetch new jobs in the prior 7-day window, capped at 20 (D-01, D-06).
          const sinceIso = new Date(
            Date.now() - DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString();
          const { data: jobsData, error: jobsError } = await db
            .from("jobs")
            .select("id,title,employer_id,location,canonical_url,apply_url,posted_at")
            .eq("status", "active")
            .gte("posted_at", sinceIso)
            .order("posted_at", { ascending: false })
            .limit(MAX_JOBS_PER_DIGEST);
          if (jobsError) throw jobsError;
          const jobs: JobRow[] = (jobsData ?? []) as JobRow[];

          // Resolve employer names in one IN-query.
          const employerNameById = new Map<string, string>();
          const employerIds = Array.from(new Set(jobs.map((j) => j.employer_id))).filter(Boolean);
          if (employerIds.length > 0) {
            const { data: employersData } = await db
              .from("employers")
              .select("id,name")
              .in("id", employerIds);
            for (const e of (employersData ?? []) as EmployerRow[]) {
              employerNameById.set(e.id, e.name);
            }
          }

          // Fetch full subscriber rows for this batch — re-check confirmed_at
          // at consumer time (Pitfall 2: subscriber may have soft-unsubscribed
          // between cron enqueue and consumer pick-up).
          const { data: subsData, error: subsError } = await db
            .from("subscribers")
            .select("id,email,locations,unsubscribe_token,confirmed_at")
            .in("id", subscriberIds)
            .not("confirmed_at", "is", null);
          if (subsError) throw subsError;
          const subs: SubscriberRow[] = (subsData ?? []) as SubscriberRow[];

          // UTC date string matching Postgres CURRENT_DATE (Pitfall 4).
          const todayDate = new Date().toISOString().slice(0, 10);

          for (const sub of subs) {
            try {
              const subJobs = applyLocationFilter(jobs, sub);

              // INSERT-BEFORE-SEND (CAND-03, Pitfall 1). The DB UNIQUE
              // constraint email_sends_subscriber_date_type_key is the gate;
              // a 23505 unique-violation means "already sent today" -> skip.
              const { error: insertError } = await db.from("email_sends").insert({
                id: crypto.randomUUID(),
                subscriber_id: sub.id,
                sent_at: new Date().toISOString(),
                jobs_count: subJobs.length,
                sent_date: todayDate,
                type: "digest",
              });
              if (insertError?.code === "23505") {
                // Already sent today — skip silently (idempotent retry).
                continue;
              }
              if (insertError) {
                console.error(
                  `[${nicheId}] subscriber ${sub.id} insert failed:`,
                  insertError,
                );
                continue;
              }

              // CR-01: per-subscriber send — a Resend failure for subscriber N
              // logs+continues without blocking subscriber N+1. The email_sends
              // row is already inserted; on retry the 23505 guard skips this
              // subscriber (one email may be lost, but not all 10).
              // D-03: even on a zero-jobs week, still send.
              const res = await fetch("https://api.resend.com/emails/batch", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${env.RESEND_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify([{
                  from: FROM_ADDRESS,
                  to: sub.email,
                  subject: buildSubject(subJobs.length, niche),
                  html: renderDigestHtml(subJobs, sub, niche, employerNameById),
                  text: renderDigestText(subJobs, sub, niche),
                  headers: {
                    "List-Unsubscribe": `<${buildUnsubscribeUrl(niche, sub.unsubscribe_token)}>`,
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                  },
                }]),
              });
              if (!res.ok) {
                const text = await res.text();
                console.error(`[${nicheId}] Resend failed for ${sub.id}: ${res.status}: ${text}`);
                continue;
              }
            } catch (err) {
              // D-17: log and skip failed subscriber; continue batch.
              console.error(`[${nicheId}] subscriber ${sub.id} failed:`, err);
              continue;
            }
          }

          msg.ack();
        } catch (err) {
          // Unrecoverable: DB enumeration failure or pre-loop error.
          // msg.retry() lets Cloudflare redeliver.
          console.error(`[${nicheId}] digest consumer failed:`, err);
          msg.retry();
        }
      }),
    );
  },
};

export default handler;
