import type { APIRoute } from "astro";
import { verifyTurnstile } from "../../lib/turnstile.js";
import { sendDeletionRequest } from "../../lib/resend.js";
import { getEnv } from "../../lib/env.js";

/**
 * GDPR Article 17 deletion-request endpoint (INFRA-08).
 *
 * Per CONTEXT.md D-13/D-14/D-16: form lives on /privacy.astro (prerendered),
 * submission emails the founder at `privacy@${niche.domain}`, processing is
 * manual (founder looks up the email in Supabase and deletes the row).
 *
 * Multi-niche correct: recipient = `privacy@${niche.domain}` — NEVER hardcoded.
 */
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
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  if (!turnstileToken) {
    return Response.json(
      { error: "Please complete the security check." },
      { status: 400 },
    );
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
  const valid = await verifyTurnstile(env, turnstileToken, ip);
  if (!valid) {
    return Response.json(
      { error: "Security check failed. Please try again." },
      { status: 400 },
    );
  }

  try {
    await sendDeletionRequest(env, {
      to: `privacy@${niche.domain}`,
      requesterEmail: email,
      fromAddress: `${niche.name} <noreply@${niche.domain}>`,
      siteName: niche.name,
    });
  } catch (err) {
    console.error("delete-request Resend error:", err);
    return Response.json(
      { error: "Could not submit request. Please try again." },
      { status: 500 },
    );
  }

  return Response.json({
    message: "We received your request and will process it within 30 days.",
  });
};
