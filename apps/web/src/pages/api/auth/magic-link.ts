import type { APIContext } from "astro";
import { getEnv } from "../../../lib/env";
import { createSupabaseServerClient } from "../../../lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST({ request, locals }: APIContext) {
  const niche = locals.niche;
  const env = getEnv(locals);

  let body: { email?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid work email." }, { status: 400 });
  }

  // shouldCreateUser: false — only employers who have completed the claim flow
  // (employer_users row exists with auth_id mapped) can log in. Cold visitors
  // are routed to /employers/[slug] for the claim flow.
  const supabase = createSupabaseServerClient(env, null, new Headers());
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `https://${niche.domain}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  if (error) {
    return Response.json(
      { error: "We couldn't send the magic link. Check the email address and try again." },
      { status: 422 },
    );
  }

  return Response.json({ ok: true }, { status: 200 });
}
