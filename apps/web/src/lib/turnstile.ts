interface TurnstileEnv {
  TURNSTILE_SECRET_KEY: string;
}

export async function verifyTurnstile(
  env: TurnstileEnv,
  token: string,
  ip?: string,
): Promise<boolean> {
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip) body.set("remoteip", ip);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!res.ok) return false;

  const json = (await res.json()) as { success: boolean };
  return json.success === true;
}
