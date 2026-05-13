import type { APIContext } from "astro";
import { getEnv } from "../../../lib/env";
import { supabaseAdmin } from "../../../lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST({ request, locals }: APIContext) {
  const niche = locals.niche;
  const env = getEnv(locals);

  let body: { email?: unknown; slug?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid work email." }, { status: 400 });
  }
  if (!slug) {
    return Response.json({ error: "Missing employer reference." }, { status: 400 });
  }

  const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";
  const db = supabaseAdmin(env);

  // Look up employer by slug in the niche schema
  const { data: employer, error: lookupError } = await db
    .schema(niche.supabaseSchema)
    .from("employers")
    .select("id, name, domain")
    .eq("slug", slug)
    .single();

  if (lookupError || !employer) {
    return Response.json({ error: "Employer not found." }, { status: 404 });
  }

  const recordedDomain = (employer.domain ?? "").toLowerCase();
  if (!recordedDomain || recordedDomain !== emailDomain) {
    return Response.json(
      {
        error: `That email doesn't match the domain we have on file for ${employer.name}. If you work there, email us at hello@${niche.domain} and we'll verify manually.`,
      },
      { status: 422 },
    );
  }

  // Generate magic link — returns user.id synchronously (creates user if absent)
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `https://${niche.domain}/auth/callback`,
    },
  });

  if (linkError || !linkData?.user) {
    return Response.json(
      { error: "We couldn't send the magic link. Try again." },
      { status: 500 },
    );
  }

  // CRITICAL (Pitfall 8): insert employer_users BEFORE returning, so the
  // custom_access_token_hook finds the row at token-issue time when the
  // employer clicks the magic link.
  const { error: upsertError } = await db.from("employer_users").upsert(
    {
      auth_id: linkData.user.id,
      employer_id: employer.id,
      niche_id: niche.supabaseSchema,
    },
    { onConflict: "employer_id,niche_id" },
  );

  if (upsertError) {
    // Don't expose internals, but log and return 500 so the user can retry.
    console.error("[claim] employer_users upsert failed", upsertError);
    return Response.json(
      { error: "We couldn't link your account. Try again." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true }, { status: 200 });
}
