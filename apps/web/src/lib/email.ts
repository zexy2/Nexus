/**
 * Transactional email — dependency-free.
 *
 * Sends via the Resend HTTP API when RESEND_API_KEY is configured. Without a
 * provider, development/test logs the message (so local flows surface the
 * link); production refuses to send and never logs the content, because the
 * content contains single-use auth links (password reset, verification).
 * Auth uses this for email verification and password reset.
 */

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** Dev/test only: without a provider the message content is printed to the log. */
function mayLogEmailContent(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Whether a password-reset link can reach the user. In production this needs
 * a real provider; auth disables the reset endpoint otherwise so it fails
 * clearly ("Reset password isn't enabled") instead of silently dropping or
 * logging the link.
 */
export function canDeliverPasswordReset(): boolean {
  return isEmailConfigured() || mayLogEmailContent();
}

export class EmailNotConfiguredError extends Error {
  readonly code = "EMAIL_PROVIDER_NOT_CONFIGURED";
  constructor() {
    super("Email provider is not configured (set RESEND_API_KEY)");
    this.name = "EmailNotConfiguredError";
  }
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
    if (!mayLogEmailContent()) {
      // Never write auth links to production logs.
      console.error(`[email] No provider configured; refusing to send subject="${opts.subject}"`);
      throw new EmailNotConfiguredError();
    }
    // Development: surface the content (e.g. the reset link) in the log.
    console.log(
      `[email] No provider configured (dev only). to=${opts.to} subject="${opts.subject}"\n${opts.text || opts.html}`
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
const LINK_FALLBACK_NOTE = {
  en: "If the button does not work, paste this address into your browser:",
  tr: "Bağlantı çalışmazsa şu adresi tarayıcına yapıştır:",
} as const;

export function actionEmailHtml(opts: {
  heading: string;
  body: string;
  ctaLabel: string;
  url: string;
  /** Footer language; omitted → bilingual (English, then Turkish). */
  locale?: "tr" | "en";
}): string {
  const note = opts.locale
    ? LINK_FALLBACK_NOTE[opts.locale]
    : `${LINK_FALLBACK_NOTE.en}<br>${LINK_FALLBACK_NOTE.tr}`;
  const body = opts.body.replace(/\n\n/g, "<br><br>");
  return `
  <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #111;">${opts.heading}</h2>
    <p style="color: #444; line-height: 1.5;">${body}</p>
    <p style="margin: 24px 0;">
      <a href="${opts.url}" style="background:#6d28d9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">${opts.ctaLabel}</a>
    </p>
    <p style="color:#888;font-size:13px;">${note}<br>${opts.url}</p>
  </div>`;
}
