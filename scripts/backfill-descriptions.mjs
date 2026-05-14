#!/usr/bin/env node
/**
 * Backfills job descriptions for rows where description IS NULL.
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from environment (or .env.local).
 * Accepts --niche <id> (default: wind-turbine) and --limit <n> (default: 500).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/backfill-descriptions.mjs
 *   # or with a .env file:
 *   node --env-file=.env.local scripts/backfill-descriptions.mjs --niche wind-turbine
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));

// --- Args ---
const args = process.argv.slice(2);
const nicheIdx = args.indexOf("--niche");
const limitIdx = args.indexOf("--limit");
const nicheArg = nicheIdx !== -1 ? args[nicheIdx + 1] : "wind-turbine";
const limitArg = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 500;
const SCHEMA = nicheArg.replace(/-/g, "_"); // wind-turbine → wind_turbine

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.");
  process.exit(1);
}

// --- Supabase REST helpers (no SDK dep) ---
function supabaseHeaders(schema) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    // Non-public schema access requires these profile headers
    "Accept-Profile": schema,
    "Content-Profile": schema,
  };
}

async function supabaseGet(table, query, schema) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const resp = await fetch(url, {
    headers: { ...supabaseHeaders(schema), Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`Supabase GET ${table} → ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function supabasePatch(table, query, body, schema) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { ...supabaseHeaders(schema), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Supabase PATCH ${table} → ${resp.status}: ${await resp.text()}`);
}

// Upsert employer with ignore-duplicates (never overwrites a native-ATS employer row).
async function supabaseUpsertIgnore(table, body, schema) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(schema),
      Prefer: "return=minimal,resolution=ignore-duplicates",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Supabase UPSERT ${table} → ${resp.status}: ${await resp.text()}`);
}

// Mirrors normalizeForKey and sha256Hex from @owljobs/schema
function normalizeForKey(s) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Sanitizer (mirrors packages/ats-adapters/src/sanitize.ts) ---
function sanitize(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    .replace(/(<p[^>]*>\s*<\/p>\s*){3,}/g, "")
    .trim();
}

// --- Workday fetcher (mirrors packages/ats-adapters/src/workday.ts) ---
async function fetchWorkday(tenant, instance, site, externalPath) {
  const baseUrl = `https://${tenant}.${instance}.myworkdayjobs.com`;
  const url = `${baseUrl}/wday/cxs/${tenant}/${site}/job${externalPath}`;
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", Origin: baseUrl },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const html = data.jobPostingInfo?.jobDescription;
    return html ? sanitize(html) : null;
  } catch {
    return null;
  }
}

// --- SuccessFactors fetcher (mirrors packages/ats-adapters/src/successfactors.ts) ---
async function fetchSuccessFactors(canonicalUrl) {
  try {
    const resp = await fetch(canonicalUrl, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible)" },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const parts = html.split(/class="jobdescription">/i);
    if (parts.length < 2) return null;
    const m = /(<\/span>)\s*(?:<\/div|<p\s)/i.exec(parts[1]);
    const raw = m ? parts[1].slice(0, m.index) : parts[1];
    return sanitize(raw.trim());
  } catch {
    return null;
  }
}

// --- Main ---
async function main() {
  console.log(`Backfilling descriptions for niche=${nicheArg} (schema=${SCHEMA}), limit=${limitArg}`);

  // Pre-fetch aggregator raw_payloads so the main loop doesn't need per-job DB calls.
  // Adzuna stores teaser in raw_payload.description; JSearch stores full HTML in raw_payload.job_description.
  const aggregatorRows = await supabaseGet(
    "discovered_jobs",
    `select=resolved_job_id,source,raw_payload&source=in.(adzuna,jsearch)&resolved_job_id=not.is.null&limit=10000`,
    SCHEMA
  );
  const aggregatorDescMap = new Map();
  for (const row of aggregatorRows) {
    const payload = row.raw_payload ?? {};
    const rawDesc = row.source === "adzuna" ? payload.description : payload.job_description;
    if (rawDesc) aggregatorDescMap.set(row.resolved_job_id, sanitize(String(rawDesc)));
  }
  console.log(`Aggregator cache: ${aggregatorDescMap.size} entries with descriptions (of ${aggregatorRows.length} rows)`);

  // Fetch jobs with NULL description, joining employers for ats_type/tenant/etc.
  const jobs = await supabaseGet(
    "jobs",
    `select=id,canonical_url,employers(ats_type,ats_tenant,ats_instance,ats_site)` +
    `&description=is.null` +
    `&classification_score=gte.0.5` +
    `&order=posted_at.desc.nullslast` +
    `&limit=${limitArg}`,
    SCHEMA
  );

  console.log(`Found ${jobs.length} jobs to enrich`);

  let enriched = 0, skipped = 0, errors = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const { ats_type, ats_tenant, ats_instance, ats_site } = job.employers ?? {};
    let description = null;

    if (ats_type === "adzuna" || ats_type === "jsearch") {
      description = aggregatorDescMap.get(job.id) ?? null;
    } else if (ats_type === "workday" && ats_tenant && ats_instance && ats_site) {
      const basePrefix = `https://${ats_tenant}.${ats_instance}.myworkdayjobs.com/${ats_site}`;
      const externalPath = job.canonical_url.startsWith(basePrefix)
        ? job.canonical_url.slice(basePrefix.length)
        : null;
      if (externalPath) {
        description = await fetchWorkday(ats_tenant, ats_instance, ats_site, externalPath);
        await sleep(500);
      }
    } else if (ats_type === "successfactors") {
      description = await fetchSuccessFactors(job.canonical_url);
      await sleep(500);
    }

    if (!description) {
      skipped++;
      if ((i + 1) % 25 === 0) console.log(`  [${i + 1}/${jobs.length}] skipped=${skipped} enriched=${enriched}`);
      continue;
    }

    try {
      await supabasePatch(
        "jobs",
        `id=eq.${encodeURIComponent(job.id)}`,
        { description },
        SCHEMA
      );
      enriched++;
    } catch (err) {
      console.error(`  Error updating job ${job.id}:`, err.message);
      errors++;
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  [${i + 1}/${jobs.length}] enriched=${enriched} skipped=${skipped} errors=${errors}`);
    }
  }

  console.log(`\nDone descriptions. enriched=${enriched} skipped=${skipped} errors=${errors}`);

  // --- Backfill employer_id for existing Adzuna/JSearch jobs ---
  // Existing jobs point to the "Adzuna (aggregator)" / "JSearch (aggregator)" sentinel.
  // We re-read raw_payload to get the actual employer name and update employer_id.
  console.log("\nBackfilling employer_id for aggregator jobs...");

  let empUpdated = 0, empSkipped = 0, empErrors = 0;
  const employerIdCache = new Map(); // name → id

  for (const row of aggregatorRows) {
    const payload = row.raw_payload ?? {};
    const rawName = row.source === "adzuna"
      ? (payload.company?.display_name ?? "")
      : (payload.employer_name ?? "");
    const name = String(rawName).trim();

    if (!name || !row.resolved_job_id) {
      empSkipped++;
      continue;
    }

    try {
      if (!employerIdCache.has(name)) {
        const normalized = normalizeForKey(name);
        const id = await sha256Hex(normalized);
        await supabaseUpsertIgnore("employers", {
          id,
          name,
          normalized_name: normalized,
          ats_type: row.source,
          ats_tenant: null,
          ats_instance: null,
          ats_site: null,
          careers_url: null,
        }, SCHEMA);
        employerIdCache.set(name, id);
      }

      const employerId = employerIdCache.get(name);
      await supabasePatch(
        "jobs",
        `id=eq.${encodeURIComponent(row.resolved_job_id)}`,
        { employer_id: employerId },
        SCHEMA
      );
      empUpdated++;
    } catch (err) {
      console.error(`  Error updating employer for job ${row.resolved_job_id}:`, err.message);
      empErrors++;
    }
  }

  console.log(`Done employers. updated=${empUpdated} skipped=${empSkipped} errors=${empErrors}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
