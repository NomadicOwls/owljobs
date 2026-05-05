interface ResendEnv {
  RESEND_API_KEY: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from: string;
  headers?: Record<string, string>;
}

async function sendEmail(env: ResendEnv, params: SendEmailParams): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      headers: params.headers,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

export async function sendConfirmation(
  env: ResendEnv,
  opts: {
    to: string;
    confirmUrl: string;
    siteName: string;
    fromAddress: string;
    unsubscribeUrl: string;
  },
): Promise<void> {
  await sendEmail(env, {
    to: opts.to,
    from: opts.fromAddress,
    subject: `Confirm your subscription to ${opts.siteName}`,
    html: `
      <p>Hi,</p>
      <p>Click the link below to confirm your email address and start receiving
      new job alerts from <strong>${opts.siteName}</strong>:</p>
      <p><a href="${opts.confirmUrl}">Confirm subscription</a></p>
      <p>If you didn't sign up, you can ignore this email.</p>
      <hr>
      <p style="font-size:0.85em;color:#666;">
        <a href="${opts.unsubscribeUrl}">Unsubscribe</a>
      </p>
    `,
    headers: {
      "List-Unsubscribe": `<${opts.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

export async function sendUnsubscribeAck(
  env: ResendEnv,
  opts: {
    to: string;
    siteName: string;
    fromAddress: string;
  },
): Promise<void> {
  await sendEmail(env, {
    to: opts.to,
    from: opts.fromAddress,
    subject: `You've been unsubscribed from ${opts.siteName}`,
    html: `
      <p>Hi,</p>
      <p>You've been successfully unsubscribed from <strong>${opts.siteName}</strong> job alerts.
      You won't receive any more emails from us.</p>
    `,
  });
}
