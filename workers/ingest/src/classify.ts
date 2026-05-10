import type { NicheConfig } from "@owljobs/niches";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDescription } from "./fetch-description.js";

type SchemaClient = ReturnType<SupabaseClient["schema"]>;

const EMBED_MODEL = "@cf/baai/bge-small-en-v1.5" as const;
const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct" as const;
const BATCH_SIZE = 10;
// Cosine thresholds: posScore >= POSITIVE_THRESHOLD → relevant; AMBIGUOUS_FLOOR..POSITIVE_THRESHOLD → LLM arbiter
const POSITIVE_THRESHOLD = 0.72;
const AMBIGUOUS_FLOOR = 0.50;

export const CLASSIFY_LIMIT = 100;

export interface ClassifyStats {
  classified: number;
  skipped: number;
  hasMore: boolean;
}

export interface ReclassifyStats {
  promoted: number;
  demoted: number;
  descFetched: number;
  errors: number;
}

interface JobRow {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  canonical_url: string;
  employers: {
    ats_type: string;
    ats_tenant: string | null;
    ats_instance: string | null;
    ats_site: string | null;
  };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    // i is always < a.length and b is same-length (embedding vector)
    const ai = a[i]!, bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function maxCosine(vec: number[], pool: number[][]): number {
  return pool.reduce((best, e) => Math.max(best, cosine(vec, e)), -1);
}

async function embedTexts(ai: Ai, texts: string[]): Promise<number[][]> {
  const result = await ai.run(EMBED_MODEL, { text: texts });
  return (result as { data: number[][] }).data;
}

function buildEmbedText(j: { title: string; location: string | null; description: string | null }): string {
  const head = j.location ? `${j.title} — ${j.location}` : j.title;
  if (!j.description) return head;
  const plain = j.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return `${head}\n\n${plain.slice(0, 1500)}`;
}

function buildLlmText(j: { title: string; location: string | null }, description: string | null): string {
  return [
    `Title: ${j.title}`,
    j.location ? `Location: ${j.location}` : null,
    description ? `Description: ${description.replace(/<[^>]+>/g, " ").slice(0, 2500)}` : null,
  ].filter(Boolean).join("\n\n");
}

async function llmYesNo(ai: Ai, prompt: string, jobText: string): Promise<"yes" | "no"> {
  const result = await ai.run(LLM_MODEL, {
    messages: [
      { role: "system", content: prompt + " Reply with only the single word YES or NO." },
      { role: "user", content: jobText },
    ],
    max_tokens: 4,
    temperature: 0,
  });
  const raw = (result as { response?: string }).response ?? "";
  const m = /^\s*(yes|no)\b/i.exec(raw);
  if (!m) {
    console.warn(`[classify] LLM unparseable: "${raw.slice(0, 80)}"`);
    return "no";
  }
  return m[1]!.toLowerCase() as "yes" | "no";
}

export async function classifyPendingJobs(
  niche: NicheConfig,
  db: SchemaClient,
  ai: Ai
): Promise<ClassifyStats> {
  const stats: ClassifyStats = { classified: 0, skipped: 0, hasMore: false };

  const { data, error } = await db
    .from("jobs")
    .select("id, title, location, description, canonical_url, employers!inner(ats_type, ats_tenant, ats_instance, ats_site)")
    .is("classification_score", null)
    .limit(CLASSIFY_LIMIT);

  if (error) throw new Error(`classifyPendingJobs: ${error.message}`);
  if (!data?.length) return stats;
  const jobs = data as unknown as JobRow[];
  stats.hasMore = jobs.length === CLASSIFY_LIMIT;

  // Embed all exemplars once — shared across the batch loop below
  const { positive, negative } = niche.classificationExemplars;
  const exemplarVecs = await embedTexts(ai, [...positive, ...negative]);
  const positiveVecs = exemplarVecs.slice(0, positive.length);
  const negativeVecs = exemplarVecs.slice(positive.length);

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const texts = batch.map(buildEmbedText);

    let jobVecs: number[][];
    try {
      jobVecs = await embedTexts(ai, texts);
    } catch (err) {
      console.error(`[classify] embedding batch failed:`, err);
      stats.skipped += batch.length;
      continue;
    }

    type ClassifyUpdate = { id: string; classification_score: number; classifier: "embedding" | "llm"; embedding: number[] };
    const updates: ClassifyUpdate[] = [];

    for (let j = 0; j < batch.length; j++) {
      const job = batch[j]!;
      const vec = jobVecs[j]!;
      const posScore = maxCosine(vec, positiveVecs);
      const negScore = maxCosine(vec, negativeVecs);

      let score: number;
      let classifier: "embedding" | "llm";

      if (posScore >= POSITIVE_THRESHOLD) {
        score = posScore;
        classifier = "embedding";
        console.log(`[classify] "${job.title}" pos=${posScore.toFixed(2)} → RELEVANT`);
      } else if (posScore < AMBIGUOUS_FLOOR && negScore >= posScore) {
        // Clearly closer to a negative exemplar → invert neg score so irrelevant jobs score low
        score = 1 - negScore;
        classifier = "embedding";
        console.log(`[classify] "${job.title}" pos=${posScore.toFixed(2)} neg=${negScore.toFixed(2)} → IRRELEVANT`);
      } else if (posScore >= AMBIGUOUS_FLOOR) {
        // Ambiguous middle band — let LLM decide
        let desc = job.description;
        if (!desc) {
          try {
            desc = await fetchDescription(job);
          } catch (err) {
            console.warn(`[classify] desc fetch failed for ${job.id}:`, err);
          }
        }
        const verdict = await llmYesNo(ai, niche.classificationPrompt, buildLlmText(job, desc));
        score = verdict === "yes" ? 0.99 : 0.01;
        classifier = "llm";
        console.log(`[classify] LLM "${job.title}" pos=${posScore.toFixed(2)} → ${verdict.toUpperCase()}`);
      } else {
        // Low posScore, low negScore (rare) — use posScore directly
        score = posScore;
        classifier = "embedding";
        console.log(`[classify] "${job.title}" → ${score.toFixed(2)}`);
      }

      updates.push({ id: job.id, classification_score: score, classifier, embedding: vec });
    }

    if (updates.length > 0) {
      const results = await Promise.allSettled(
        updates.map(({ id, classification_score, classifier, embedding }) =>
          db.from("jobs").update({ classification_score, classifier, embedding }).eq("id", id)
        )
      );
      let failed = 0;
      for (const r of results) {
        if (r.status === "rejected") {
          console.error(`[classify] update failed:`, r.reason);
          failed++;
        } else if (r.value.error) {
          console.error(`[classify] update error:`, r.value.error.message);
          failed++;
        }
      }
      stats.classified += updates.length - failed;
      stats.skipped += failed;
    }
  }

  return stats;
}

export async function reclassifyAmbiguous(
  niche: NicheConfig,
  db: SchemaClient,
  ai: Ai,
  opts: { limit?: number; dry?: boolean } = {}
): Promise<ReclassifyStats> {
  const { limit = 100, dry = false } = opts;
  const stats: ReclassifyStats = { promoted: 0, demoted: 0, descFetched: 0, errors: 0 };

  const { data, error } = await db
    .from("jobs")
    .select("id, title, location, description, canonical_url, employers!inner(ats_type, ats_tenant, ats_instance, ats_site)")
    .eq("classifier", "embedding")
    .gte("classification_score", AMBIGUOUS_FLOOR)
    .lt("classification_score", POSITIVE_THRESHOLD)
    .limit(limit);

  if (error) throw new Error(`reclassifyAmbiguous: ${error.message}`);
  const rows = (data ?? []) as unknown as JobRow[];

  for (const job of rows) {
    try {
      let desc = job.description;
      if (!desc) {
        try {
          desc = await fetchDescription(job);
          if (desc) stats.descFetched++;
        } catch {
          // best-effort
        }
      }

      const verdict = await llmYesNo(ai, niche.classificationPrompt, buildLlmText(job, desc));
      const newScore = verdict === "yes" ? 0.99 : 0.01;

      console.log(`[reclassify] "${job.title}" → ${verdict.toUpperCase()}${dry ? " (dry)" : ""}`);

      if (!dry) {
        const { error: upErr } = await db
          .from("jobs")
          .update({ classification_score: newScore, classifier: "llm" })
          .eq("id", job.id);
        if (upErr) {
          console.error(`[reclassify] update failed:`, upErr.message);
          stats.errors++;
        } else {
          verdict === "yes" ? stats.promoted++ : stats.demoted++;
        }
      } else {
        verdict === "yes" ? stats.promoted++ : stats.demoted++;
      }
    } catch (err) {
      console.error(`[reclassify] error for ${job.id}:`, err);
      stats.errors++;
    }
  }

  return stats;
}
