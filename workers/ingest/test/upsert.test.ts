import { describe, it, expect } from "vitest";

// Test focuses on the reactivation logic added to upsertJob's 23505 branch.
// Because upsertJob is not exported, we test by asserting the source-level
// code contract: when an INSERT fails with 23505, BOTH the description-backfill
// UPDATE and the reactivation UPDATE must be present in the source.

describe("upsertJob 23505 reactivation contract (CONTEXT D-05)", () => {
  it("source contains the reactivation UPDATE inside the 23505 branch", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("workers/ingest/src/ingest.ts", "utf-8");
    // Find the 23505 block
    const idx = src.indexOf('error.code === "23505"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 800);
    // Reactivation UPDATE must be present
    expect(block).toMatch(/status:\s*["']active["']/);
    expect(block).toMatch(/expired_at:\s*null/);
    expect(block).toMatch(/\.eq\(\s*["']status["']\s*,\s*["']expired["']\s*\)/);
  });
});
