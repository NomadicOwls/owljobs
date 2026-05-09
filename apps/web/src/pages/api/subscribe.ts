import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase.js";
import { verifyTurnstile } from "../../lib/turnstile.js";
import { sendConfirmation } from "../../lib/resend.js";
import { getEnv } from "../../lib/env.js";

export const POST: APIRoute = async ({ locals, request }) => {
  const { niche } = locals;
  const env = getEnv(locals);

  let body: { email?: string; turnstileToken?: string; consent?: boolean };
  try {
    body = (await request.json()) as { email?: string; turnstileToken?: string; consent?: boolean };
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

  if (!body.consent) {
    return Response.json({ error: "Consent required." }, { status: 400 });
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
  const valid = await verifyTurnstile(env, turnstileToken, ip);
  if (!valid) {
    return Response.json({ error: "Security check failed. Please try again." }, { status: 400 });
  }

  const confirmationToken = crypto.randomUUID();
  const unsubscribeToken = crypto.randomUUID();

  const db = supabaseAdmin(env);

  // ignoreDuplicates: true — re-submission is a no-op on the row, preserving
  // confirmed_at and unsubscribe_token for already-confirmed subscribers (CR-02).
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
        consent_given_at: new Date().toISOString(),
      },
      { onConflict: "email,niche", ignoreDuplicates: true },
    );

  if (upsertError) {
    console.error("Subscribe upsert error:", upsertError);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // Fetch the actual (pre-existing or just-inserted) tokens
  const { data: subData, error: selectError } = await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .select("confirmation_token, unsubscribe_token, confirmed_at")
    .eq("email", email)
    .eq("niche", niche.id)
    .single();

  if (selectError || !subData) {
    console.error("Subscribe select error:", selectError);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // Already confirmed — no need to resend confirmation email
  if (subData.confirmed_at) {
    return Response.json({ message: "Check your inbox to confirm your subscription." });
  }

  const confirmUrl = `https://${niche.domain}/api/confirm?token=${subData.confirmation_token}`;
  const unsubscribeUrl = `https://${niche.domain}/api/unsubscribe?token=${subData.unsubscribe_token}`;

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
