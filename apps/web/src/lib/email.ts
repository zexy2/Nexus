/**
 * Transactional email — dependency-free.
 *
 * Sends via the Resend HTTP API when RESEND_API_KEY is configured; otherwise
 * logs the message (so local/dev flows surface the link instead of failing
 * silently). Auth uses this for email verification and password reset.
 */

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

const DEFAULT_FROM = "Nexus <onboarding@resend.dev>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // No provider: don't fail the auth flow — surface the content in logs.
    console.log(
      `[email] No provider configured. to=${opts.to} subject="${opts.subject}"\n${opts.text || opts.html}`
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Email send failed: ${response.status} ${body}`);
  }
}

/** Minimal branded HTML wrapper around a call-to-action link. */
export function actionEmailHtml(opts: { heading: string; body: string; ctaLabel: string; url: string }): string {
  return `
  <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #111;">${opts.heading}</h2>
    <p style="color: #444; line-height: 1.5;">${opts.body}</p>
    <p style="margin: 24px 0;">
      <a href="${opts.url}" style="background:#6d28d9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">${opts.ctaLabel}</a>
    </p>
    <p style="color:#888;font-size:13px;">Bağlantı çalışmazsa şu adresi tarayıcına yapıştır:<br>${opts.url}</p>
  </div>`;
}
