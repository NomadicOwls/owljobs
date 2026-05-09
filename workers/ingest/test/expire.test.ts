import { describe, it, expect, vi, beforeEach } from "vitest";
import { expireMissingJobs, cleanupExpired } from "../src/expire.js";

vi.mock("../src/google-indexing.js", () => ({
  pingUrlUpdated: vi.fn(),
}));
import { pingUrlUpdated } from "../src/google-indexing.js";

// Build a chainable mock that mimics the supabase-js fluent builder.
function makeDbMock(opts: {
  selectRows?: Array<{ id: string; canonical_url: string }>;
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
  deleteRows?: Array<{ id: string }>;
  deleteError?: { message: string } | null;
}) {
  const update = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
  });
  const eqChain = (rows: Array<{ id: string; canonical_url: string }>) => ({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: rows, error: opts.selectError ?? null }),
    }),
  });
  const deleteFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: opts.deleteRows ?? [], error: opts.deleteError ?? null }),
      }),
    }),
  });
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "jobs") {
        return {
          select: vi.fn().mockReturnValue(eqChain(opts.selectRows ?? [])),
          update: update,
          delete: deleteFn,
        };
      }
      return {};
    }),
    __update: update,
    __delete: deleteFn,
  } as any;
}

describe("expireMissingJobs", () => {
  beforeEach(() => {
    vi.mocked(pingUrlUpdated).mockReset();
  });

  it("returns zeros when fetchedJobIds is empty (CONTEXT D-01 outage guard)", async () => {
    const db = makeDbMock({ selectRows: [{ id: "a", canonical_url: "https://x/a" }] });
    const r = await expireMissingJobs(db, "emp-1", new Set(), "sa");
    expect(r).toEqual({ marked: 0, reactivated: 0, pinged: 0, pingFailures: 0, pingsSkipped: 0 });
    // Should not have run the SELECT at all
    expect(db.from).not.toHaveBeenCalled();
  });

  it("marks jobs absent from fetchedJobIds as expired", async () => {
    const db = makeDbMock({
      selectRows: [
        { id: "a", canonical_url: "https://x/a" },
        { id: "b", canonical_url: "https://x/b" },
        { id: "c", canonical_url: "https://x/c" },
      ],
    });
    vi.mocked(pingUrlUpdated).mockResolvedValue({ ok: true, status: 200 });
    const r = await expireMissingJobs(db, "emp-1", new Set(["a"]), "sa");
    expect(r.marked).toBe(2);                          // b and c are absent
    expect(r.pinged).toBe(2);
    expect(pingUrlUpdated).toHaveBeenCalledTimes(2);
  });

  it("does not mark jobs present in fetchedJobIds", async () => {
    const db = makeDbMock({
      selectRows: [
        { id: "a", canonical_url: "https://x/a" },
        { id: "b", canonical_url: "https://x/b" },
      ],
    });
    const r = await expireMissingJobs(db, "emp-1", new Set(["a", "b"]), undefined);
    expect(r.marked).toBe(0);
  });

  it("caps pings at PING_BUDGET_PER_RUN=100 and reports pingsSkipped", async () => {
    const rows = Array.from({ length: 105 }, (_, i) => ({ id: `id-${i}`, canonical_url: `https://x/${i}` }));
    const db = makeDbMock({ selectRows: rows });
    vi.mocked(pingUrlUpdated).mockResolvedValue({ ok: true, status: 200 });
    const r = await expireMissingJobs(db, "emp-1", new Set(["sentinel-not-in-rows"]), "sa");
    expect(r.marked).toBe(105);
    expect(r.pinged).toBe(100);
    expect(r.pingsSkipped).toBe(5);
  });

  it("treats ping failures as non-fatal", async () => {
    const db = makeDbMock({
      selectRows: [
        { id: "a", canonical_url: "https://x/a" },
        { id: "b", canonical_url: "https://x/b" },
      ],
    });
    vi.mocked(pingUrlUpdated)
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const r = await expireMissingJobs(db, "emp-1", new Set(["c"]), "sa");
    expect(r.marked).toBe(2);
    expect(r.pinged).toBe(1);
    expect(r.pingFailures).toBe(1);
  });

  it("skips pings when saJson is undefined", async () => {
    const db = makeDbMock({ selectRows: [{ id: "a", canonical_url: "https://x/a" }] });
    const r = await expireMissingJobs(db, "emp-1", new Set(["b"]), undefined);
    expect(r.marked).toBe(1);
    expect(r.pinged).toBe(0);
    expect(pingUrlUpdated).not.toHaveBeenCalled();
  });
});

describe("cleanupExpired", () => {
  it("deletes only status='expired' rows older than 90 days", async () => {
    const db = makeDbMock({ deleteRows: [{ id: "a" }, { id: "b" }] });
    const n = await cleanupExpired(db);
    expect(n).toBe(2);
  });

  it("returns 0 when nothing to clean up", async () => {
    const db = makeDbMock({ deleteRows: [] });
    const n = await cleanupExpired(db);
    expect(n).toBe(0);
  });
});
