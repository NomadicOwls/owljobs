import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pingUrlUpdated } from "../src/google-indexing.js";

// A valid RSA-2048 PKCS8 private key generated for this test only (throwaway).
// The \n sequences in this string are literal backslash-n (as stored in a JSON env var).
const fixturePem = "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC2ROPaObpfnl9d\\nJNCbz3vunbpr16h66n+WBHZeVyUD7UVCi6usGNmbRMMHrV9R1Q82ErnvLA9C+BhR\\n6yVeydBfk04iWmUmuxBvmMyvkXO4DZII79Nit++kDuJBxvnOJZz279EmY1koR8xr\\nchkYt74D68mE28Ir5OLI2LhppzgqXKCn3ZZqvXJuU29Nu6Lh9kgYY7omSzm2FYEd\\nZMxMVS3fgzRLgK/DxVEInBTMFkuJKmnAngUMdlyJkG0bfxumzKv+Nec792mDtEer\\nGHr5ehuwYzCW+SmsjYJT6e1ZrvztgSZnmdPjwYpFmkb0W5pS3mjHPEpG3dCiqVTp\\nR0HgQ5ZVAgMBAAECggEAA8fBfwrv9+A5w52KGxUuUZhhX6+5HZWEAGlGyDWf/akb\\n5OGvNZJNXxhJwDzDC5gy6NDyHMkJ5v5syLQrEgB3CyhruDAuRWOfV2Uwp5qJbyGO\\n7BMHTBabCIjLfghBsZobm46FRLnORVTZ40eaSCY1cXDgPNpu+EiWwIooJv7SHiTF\\nMhWGWeai0yHHvPGyzvzhXXJShBXohfYsllVfn3YGxYIRoX5KYll8fATbhLfYLupz\\nQGHq1FdLTlSsIMZs0faIGUMhTfPwYKE4yGDP8oGuRS0PdIIcfnT2Ro8136Jd04HF\\nDFv7zjp3IFWlNqOdqtbtyJLYf8oyWtNw7J9xqD22YQKBgQDj65vTzg4Pa+SFakz/\\nBtzaZrSGDKLef/8y9S9Mxw8/dXBJD2sZwRPn6zfaBtrV26ttsRSRCRkntjBOK8mt\\n/EbGMimqaWOf/u4PRhxdLp50CVVY//FgND4o77DLrVk9CvVXNP4FvCXCKv9Xmvdp\\n6HnHJ6a2E9TkqnBFgfvv2g4fYQKBgQDMuXwEKwZbYN2WXWTMgIULgf/R2gNl1HFz\\nxsA313SAXuXVI+XFWfcsqC4fQjibJ8AGNyaJAurDO9BI2gopvmu09j1hrKDQhXY9\\nXdts4cOi+Jb5tqis4Gw3KCVGPX/NwHBNLBrbKEOGaUeiB4sGACbVOlPhxQIFJ90y\\nnGIyrZKfdQKBgDoIcMnyanQUxcAOvAInji5x/j8vknzS3HjuIxgKi2BeF7QSn/OT\\nzOy9YKA8JJZVc4Xfk9wGFAifhBczYQvS83ZdqWxBn2NKtvTepjQ3vZLQGZIqwRv8\\n0WL8/OgvgExhsOx+iruNF5Qj/JYi2CJ4ViGWgAVWcVuz5hhcq3h77iKhAoGBAI/Z\\n3ZyIJuVagRlA8q0HuXTGmdz41d5dkoKJq1MRn5j8FX7YxIERoC7O1em8/E15duJn\\nKjqnxBH/G3G1U+LVHJWBWMwjIrSistyX8LDnSjJffqZkhM1EvIVdPiPG3uDSUZbI\\nYO6RsjDmFSFzL2q9/ItjesFvTuYUhscjP5TgheBpAoGAYnILa4tkFbMtSybNdpEs\\nkDeLDp6Phw5vjKiJhPrpWN3BC+fAvuKZflX5QnDVXaStS0OU6U/V8AkoOWlCdHHC\\nlxYlJfIw2NPSmjGOH9ovRckI76rcHbthW2ECgKFd0taxGv6TIoeuHIveW87PTDzL\\nmur/V5XXeABv5mOkPp3oK90=\\n-----END PRIVATE KEY-----\\n";

const fixtureSa = JSON.stringify({
  client_email: "indexing-bot@test-project.iam.gserviceaccount.com",
  private_key: fixturePem,
  token_uri: "https://oauth2.googleapis.com/token",
});

describe("pingUrlUpdated", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns {ok:true, status:200} when both token-exchange and publish succeed", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "TOKEN" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const r = await pingUrlUpdated(fixtureSa, "https://example.test/jobs/abc");
    expect(r).toEqual({ ok: true, status: 200 });
  });

  it("returns {ok:false, status:403} when publish hits quota (403)", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "TOKEN" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));
    const r = await pingUrlUpdated(fixtureSa, "https://example.test/jobs/abc");
    expect(r).toEqual({ ok: false, status: 403 });
  });

  it("throws 'token exchange failed:' when OAuth2 returns non-2xx", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(new Response("invalid_grant", { status: 400 }));
    await expect(pingUrlUpdated(fixtureSa, "https://example.test/jobs/abc")).rejects.toThrow(/token exchange failed: 400/);
  });
});
