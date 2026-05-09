// workers/ingest/src/google-indexing.ts
//
// Google Indexing API ping — RS256 JWT signed with WebCrypto via `jose`,
// exchanged for an OAuth2 access token, then POST to urlNotifications:publish.
//
// Edge-only (CLAUDE.md "Edge only" hard rule): no node:crypto. `jose` v6 uses crypto.subtle.
//
// Failure mode: ping failures are NON-FATAL at the caller — return {ok, status},
// throw only on token-exchange failure (which is config error, not transient).

import { SignJWT, importPKCS8 } from "jose";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;       // PEM. When stored as JSON in env, \n is literal `\\n`.
  token_uri: string;         // Typically "https://oauth2.googleapis.com/token"
}

async function getAccessToken(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson) as ServiceAccountKey;

  // The private_key in the downloaded JSON has literal \n; must be unescaped to
  // real newlines before importPKCS8 will parse it.
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const privateKey = await importPKCS8(pem, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/indexing",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/**
 * Ping the Google Indexing API that a URL has changed (transition to 410, etc).
 * @param saJson - Full service-account JSON (as written to GOOGLE_INDEXING_KEY Worker secret).
 * @param url - The canonical URL whose content has changed.
 * @returns {ok, status} — caller treats !ok as non-fatal.
 */
export async function pingUrlUpdated(
  saJson: string,
  url: string,
): Promise<{ ok: boolean; status: number }> {
  const accessToken = await getAccessToken(saJson);

  const res = await fetch(
    "https://indexing.googleapis.com/v3/urlNotifications:publish",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
    },
  );
  return { ok: res.ok, status: res.status };
}
