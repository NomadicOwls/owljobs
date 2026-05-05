import type { NicheConfig } from "@owljobs/niches";
import type { SupabaseClient } from "@supabase/supabase-js";

type SchemaClient = ReturnType<SupabaseClient["schema"]>;

const EMBED_MODEL = "@cf/baai/bge-small-en-v1.5" as const;
const BATCH_SIZE = 10;
// Cosine thresholds: posScore >= POSITIVE → relevant; posScore < AMBIGUOUS + negScore dominates → irrelevant
const POSITIVE_THRESHOLD = 0.72;
const AMBIGUOUS_FLOOR = 0.50;

export const CLASSIFY_LIMIT = 100;

export interface ClassifyStats {
  classified: number;
  skipped: number;
  hasMore: boolean;
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


export async function classifyPendingJobs(
  niche: NicheConfig,
  db: SchemaClient,
  ai: Ai
): Promise<ClassifyStats> {
  const stats: ClassifyStats = { classified: 0, skipped: 0, hasMore: false };

  const { data: jobs, error } = await db
    .from("jobs")
    .select("id, title, location")
    .is("classification_score", null)
    .limit(CLASSIFY_LIMIT);

  if (error) throw new Error(`classifyPendingJobs: ${error.message}`);
  if (!jobs?.length) return stats;
  stats.hasMore = jobs.length === CLASSIFY_LIMIT;

  // Embed all exemplars once — shared across the batch loop below
  const { positive, negative } = niche.classificationExemplars;
  const exemplarVecs = await embedTexts(ai, [...positive, ...negative]);
  const positiveVecs = exemplarVecs.slice(0, positive.length);
  const negativeVecs = exemplarVecs.slice(positive.length);

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const texts = batch.map((j) =>
      j.location ? `${j.title} — ${j.location}` : j.title
    );

    let jobVecs: number[][];
    try {
      jobVecs = await embedTexts(ai, texts);
    } catch (err) {
      console.error(`[classify] embedding batch failed:`, err);
      stats.skipped += batch.length;
      continue;
    }

    type ClassifyUpdate = { id: string; classification_score: number; classifier: "embedding"; embedding: number[] };
    const updates: ClassifyUpdate[] = [];

    for (let j = 0; j < batch.length; j++) {
      const job = batch[j]!;
      const vec = jobVecs[j]!;
      const posScore = maxCosine(vec, positiveVecs);
      const negScore = maxCosine(vec, negativeVecs);

      // Clearly closer to a negative exemplar → invert neg score so irrelevant jobs score low
      const score = (posScore < AMBIGUOUS_FLOOR && negScore >= posScore)
        ? 1 - negScore
        : posScore;

      updates.push({ id: job.id, classification_score: score, classifier: "embedding", embedding: vec });
      console.log(`[classify] "${job.title}" → ${score.toFixed(2)}`);
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
