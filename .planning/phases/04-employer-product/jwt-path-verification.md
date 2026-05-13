# JWT Path Verification

Verified: 2026-05-13

## Method

Derived from hook code inspection + Supabase JWT structure (live session confirmation deferred to first real employer login, but hook output is deterministic):

The `custom_access_token_hook` function sets:
```sql
claims := jsonb_set(
  claims,
  '{app_metadata}',
  COALESCE(claims->'app_metadata', '{}'::JSONB)
    || jsonb_build_object('employer_id', emp_id, 'employer_niche', niche_name)
);
```

`employer_id` is injected **inside** `app_metadata`, not flattened to the top level.

## Result

**employer_id path:** `auth.jwt()->'app_metadata'->>'employer_id'`
**employer_niche path:** `auth.jwt()->'app_metadata'->>'employer_niche'`

## RLS Expression to Use in Migration 0008

```sql
(auth.jwt()->'app_metadata'->>'employer_id')
```

## Ops Status

- [x] Migration 0007 applied to remote Supabase (2026-05-13)
- [x] `employer_users` table exists with correct columns
- [x] `idx_jobs_featured` recreated with `WHERE featured_until IS NOT NULL`
- [x] `custom_access_token_hook` function exists in `public` schema
- [x] Auth Hook enabled via Management API: `pg-functions://postgres/public/custom_access_token_hook`
- [ ] Live JWT decode confirmation (defer to first real employer magic-link login)
