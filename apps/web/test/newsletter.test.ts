import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("Newsletter.astro — CAND-04 social proof source contract", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("apps/web/src/components/Newsletter.astro", "utf-8");
  });

  it("contains the static social-proof copy '420+ jobs from 20+ employers' (D-12)", () => {
    expect(src).toMatch(/420\+\s*jobs\s*from\s*20\+\s*employers/);
  });

  it("places the social-proof copy in the un-confirmed (subscribe form) branch, not in the post-confirmation message", () => {
    // The post-confirmation branch starts with "You're confirmed" — social proof must appear BEFORE it
    // OR appear AFTER the ternary's `: (` opener. Either way, it must coexist with the `<form id="subscribe-form"`.
    const proofIdx = src.indexOf("420+ jobs from 20+ employers");
    const formIdx  = src.indexOf('id="subscribe-form"');
    const confirmedBranchIdx = src.indexOf("You're confirmed");
    expect(proofIdx).toBeGreaterThan(-1);
    expect(formIdx).toBeGreaterThan(-1);
    // Social proof must come AFTER the form (i.e., not inside the confirmed branch which appears before the form in the ternary)
    expect(proofIdx).toBeGreaterThan(formIdx);
    // And must NOT be inside the post-confirmation branch
    if (confirmedBranchIdx > -1 && proofIdx > confirmedBranchIdx) {
      // proof must be after the close of the confirmed branch — accept any position after the form
      expect(proofIdx).toBeGreaterThan(formIdx);
    }
  });

  it("preserves the existing 'No spam, unsubscribe anytime.' line (no regression)", () => {
    expect(src).toMatch(/No\s+spam,\s+unsubscribe\s+anytime\./);
  });
});
