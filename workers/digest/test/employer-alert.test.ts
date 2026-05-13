import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("workers/digest/src/index.ts — ANLYT-02 employer match alerts", () => {
  let src = "";
  let toml = "";
  beforeAll(async () => {
    src = await readFile(new URL("../src/index.ts", import.meta.url), "utf-8");
    toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf-8");
  });

  it("ANLYT-02 — defines EMPLOYER_ALERTS queue binding", () => {
    expect(toml).toMatch(/EMPLOYER_ALERTS|owljobs-employer-alerts/);
  });

  it("ANLYT-02 — counts confirmed subscribers in last 7 days", () => {
    expect(src).toMatch(/INTERVAL\s+['"]7\s+days['"]|confirmed_at|7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  it("ANLYT-02 — multi-niche: iterates niches via getAllNiches", () => {
    expect(src).toMatch(/getAllNiches/);
  });
});
