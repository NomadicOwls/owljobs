---
phase: 4
slug: employer-product
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `apps/web/vitest.config.ts` (check if exists; Wave 0 creates if missing) |
| **Quick run command** | `pnpm --filter @owljobs/web test` |
| **Full suite command** | `pnpm --filter @owljobs/web test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @owljobs/web test`
- **After every plan wave:** Run `pnpm --filter @owljobs/web test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-xx-01 | migrations | 0 | PROF-01, FEAT-01, FEAT-03 | — | domain column non-injectable; RLS employer_id path verified | unit (Wave 0 stubs) | `pnpm --filter @owljobs/web test --run` | ❌ W0 | ⬜ pending |
| 04-xx-02 | employer logo | 1 | PROF-01 | — | logo.dev URL formed correctly; initials fallback on null domain | unit | `pnpm test -- employer-logo` | ❌ W0 | ⬜ pending |
| 04-xx-03 | claim API | 1 | PROF-02 | Claim spoofing | domain mismatch → 422; match → magic link sent | unit | `pnpm test -- claim` | ❌ W0 | ⬜ pending |
| 04-xx-04 | auth callback | 2 | PROF-03 | JWT claim bypass | PKCE exchange succeeds; employer_id in JWT; redirects /dashboard | integration | Manual (Supabase) | ❌ | ⬜ pending |
| 04-xx-05 | featured jobs query | 1 | FEAT-01 | — | only jobs with `featured_until > NOW()` returned | unit | `pnpm test -- jobs` | ❌ W0 | ⬜ pending |
| 04-xx-06 | featured toggle API | 2 | FEAT-03 | IDOR | employer_id match checked before UPDATE; sets `NOW() + 30d` | unit | `pnpm test -- featured` | ❌ W0 | ⬜ pending |
| 04-xx-07 | employer alert | 3 | ANLYT-02 | — | subscriber count scoped by niche; fires weekly | unit | `pnpm test -- employer-alert` | ❌ W0 | ⬜ pending |
| 04-xx-08 | stats API | 3 | ANLYT-01 | SQL injection | employer_id validated `/^[a-f0-9]{64}$/` before CF SQL query | integration | Manual (CF binding) | ❌ | ⬜ pending |
| 04-xx-09 | SEO landing pages | 2 | PROF-04 (SEO) | — | route resolves; niche prefix correct; 404 for unknown slugs | unit | `pnpm test -- landing` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/test/employer-logo.test.ts` — unit stubs for PROF-01 (logo.dev URL, initials fallback)
- [ ] `apps/web/test/claim.test.ts` — unit stubs for PROF-02 (domain match/mismatch, rate limit)
- [ ] `apps/web/test/jobs.test.ts` — unit stubs for FEAT-01 (featured query filter), extend existing if present
- [ ] `apps/web/test/featured.test.ts` — unit stubs for FEAT-03 (toggle sets `featured_until`, IDOR guard)
- [ ] `apps/web/test/landing.test.ts` — unit stubs for SEO landing route (slug resolution, 404)
- [ ] `workers/digest/test/employer-alert.test.ts` — unit stubs for ANLYT-02 (subscriber count scoping)
- [ ] `apps/web/vitest.config.ts` — create if missing

*Wave 0 must complete before any Wave 1 implementation tasks begin.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auth callback PKCE exchange + employer_id JWT claim | PROF-03 | Requires live Supabase Auth session and Auth Hook | Request magic link → click email link → verify redirects to /dashboard with session containing employer_id claim |
| Analytics Engine stats in dashboard | ANLYT-01 | Requires CF Analytics Engine binding (not mockable in unit tests) | Post test events via track endpoint → wait → verify /api/stats returns aggregated counts |
| Featured jobs render pinned on `/jobs` | FEAT-01 | Visual / page render | Manually set `featured_until = NOW() + interval '1 day'` → load /jobs → confirm featured card appears first |
| Magic link email delivery | PROF-02 | Requires Resend + production Supabase | Enter valid work email in claim form → verify email received with correct employer in body |
| RLS employer_id JWT path | Critical Finding 4 | Live Supabase session required to verify `auth.jwt()->>'employer_id'` vs nested path | Log in as test employer → run `SELECT auth.jwt()` from SQL editor → confirm path before writing RLS policies |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
