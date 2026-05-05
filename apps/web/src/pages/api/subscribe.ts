import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase.js";
import { verifyTurnstile } from "../../lib/turnstile.js";
import { sendConfirmation } from "../../lib/resend.js";
import { getEnv } from "../../lib/env.js";

export const POST: APIRoute = async ({ locals, request }) => {
  const { niche } = locals;
  const env = getEnv(locals);

  let body: { email?: string; turnstileToken?: string };
  try {
    body = (await request.json()) as { email?: string; turnstileToken?: string };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const turnstileToken = body.turnstileToken ?? "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  if (!turnstileToken) {
    return Response.json({ error: "Please complete the security check." }, { status: 400 });
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
  const valid = await verifyTurnstile(env, turnstileToken, ip);
  if (!valid) {
    return Response.json({ error: "Security check failed. Please try again." }, { status: 400 });
  }

  const confirmationToken = crypto.randomUUID();
  const unsubscribeToken = crypto.randomUUID();

  const db = supabaseAdmin(env);

  const { error: upsertError } = await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .upsert(
      {
        id: crypto.randomUUID(),
        email,
        niche: niche.id,
        confirmation_token: confirmationToken,
        unsubscribe_token: unsubscribeToken,
        confirmed_at: null,
        locations: null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "email,niche", ignoreDuplicates: false },
    );

  if (upsertError) {
    console.error("Subscribe upsert error:", upsertError);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // Fetch the current (possibly pre-existing) confirmation token for this subscriber
  const { data: subData } = await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .select("confirmation_token, unsubscribe_token")
    .eq("email", email)
    .eq("niche", niche.id)
    .single();

  const actualConfirmToken = (subData as { confirmation_token: string | null; unsubscribe_token: string } | null)?.confirmation_token ?? confirmationToken;
  const actualUnsubToken = (subData as { confirmation_token: string | null; unsubscribe_token: string } | null)?.unsubscribe_token ?? unsubscribeToken;

  const confirmUrl = `https://${niche.domain}/api/confirm?token=${actualConfirmToken}`;
  const unsubscribeUrl = `https://${niche.domain}/api/unsubscribe?token=${actualUnsubToken}`;

  try {
    await sendConfirmation(env, {
      to: email,
      confirmUrl,
      siteName: niche.name,
      fromAddress: `${niche.name} <noreply@${niche.domain}>`,
      unsubscribeUrl,
    });
  } catch (err) {
    console.error("Resend error:", err);
    return Response.json(
      { error: "Could not send confirmation email. Please try again." },
      { status: 500 },
    );
  }

  return Response.json({ message: "Check your inbox to confirm your subscription." });
};
