/**
 * Copy for the password-reset and verification emails.
 *
 * The locale comes from the request that triggered the email (the UI
 * `nexus-locale` cookie or `x-nexus-locale` header). When it is unknown, the
 * email is bilingual (English first, then Turkish).
 */
import type { AppLocale } from "@/lib/i18n/locale";

export type AuthEmailKind = "resetPassword" | "verifyEmail";

interface EmailCopy {
  subject: string;
  text: (url: string) => string;
  heading: string;
  body: string;
  ctaLabel: string;
}

const COPY: Record<AuthEmailKind, Record<AppLocale, EmailCopy>> = {
  resetPassword: {
    en: {
      subject: "Nexus — Reset your password",
      text: (url) => `Reset your password: ${url}`,
      heading: "Reset your password",
      body: "Click the link below to reset your password. If you did not request this, you can ignore this email.",
      ctaLabel: "Reset password",
    },
    tr: {
      subject: "Nexus — Şifre sıfırlama",
      text: (url) => `Şifreni sıfırlamak için: ${url}`,
      heading: "Şifre sıfırlama",
      body: "Şifreni sıfırlamak için aşağıdaki bağlantıya tıkla. Bu isteği sen yapmadıysan görmezden gelebilirsin.",
      ctaLabel: "Şifreyi sıfırla",
    },
  },
  verifyEmail: {
    en: {
      subject: "Nexus — Verify your email address",
      text: (url) => `Verify your email address: ${url}`,
      heading: "Verify your email",
      body: "Verify your email address to activate your Nexus account.",
      ctaLabel: "Verify my email",
    },
    tr: {
      subject: "Nexus — E-posta adresini doğrula",
      text: (url) => `E-posta adresini doğrulamak için: ${url}`,
      heading: "E-postanı doğrula",
      body: "Nexus hesabını etkinleştirmek için e-posta adresini doğrula.",
      ctaLabel: "E-postamı doğrula",
    },
  },
};

export function authEmailCopy(
  kind: AuthEmailKind,
  locale: AppLocale | undefined,
  url: string
): { subject: string; text: string; heading: string; body: string; ctaLabel: string } {
  if (locale) {
    const copy = COPY[kind][locale];
    return { subject: copy.subject, text: copy.text(url), heading: copy.heading, body: copy.body, ctaLabel: copy.ctaLabel };
  }
  const en = COPY[kind].en;
  const tr = COPY[kind].tr;
  return {
    subject: `${en.subject} / ${tr.subject.replace(/^Nexus — /, "")}`,
    text: `${en.text(url)}\n\n${tr.text(url)}`,
    heading: `${en.heading} / ${tr.heading}`,
    body: `${en.body}\n\n${tr.body}`,
    ctaLabel: `${en.ctaLabel} / ${tr.ctaLabel}`,
  };
}
