import { describe, it, expect, expectTypeOf } from "vitest";
import type { Job, Subscriber } from "../src/index.js";

describe("Job type extensions (Phase 1 / migration 0004)", () => {
  it("preserves existing expires_at field (employer-stated closing date)", () => {
    expectTypeOf<Job>().toHaveProperty("expires_at");
  });
  it("adds new status field with active|expired union", () => {
    const j = { status: "active" } as Pick<Job, "status">;
    expect(["active", "expired"]).toContain(j.status);
  });
  it("adds new expired_at field (soft-delete detection)", () => {
    expectTypeOf<Job>().toHaveProperty("expired_at");
  });
  it("expires_at and expired_at are SEPARATE fields", () => {
    // Both are string|null but the names are distinct properties
    const stub: Pick<Job, "expires_at" | "expired_at"> = { expires_at: null, expired_at: null };
    expect(stub).toHaveProperty("expires_at");
    expect(stub).toHaveProperty("expired_at");
  });
});

describe("Subscriber type extensions", () => {
  it("adds consent_given_at field", () => {
    expectTypeOf<Subscriber>().toHaveProperty("consent_given_at");
  });
});
