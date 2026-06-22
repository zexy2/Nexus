import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "@nexus/database/schema";
import { actionEmailHtml, isEmailConfigured, sendEmail } from "./email";

const socialProviders = {
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
      }
    : {}),
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
};

const trustedOrigins = (process.env.AUTH_TRUSTED_ORIGINS || process.env.BETTER_AUTH_URL || "http://localhost:3000,http://localhost:3001")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Only require verification when we can actually send the email — otherwise
    // production sign-ups would be permanently locked out (verification on, no
    // mail provider). Configure RESEND_API_KEY to enforce it.
    requireEmailVerification: process.env.NODE_ENV === "production" && isEmailConfigured(),
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendEmail({
        to: user.email,
        subject: "Nexus — Şifre sıfırlama",
        text: `Şifreni sıfırlamak için: ${url}`,
        html: actionEmailHtml({
          heading: "Şifre sıfırlama",
          body: "Şifreni sıfırlamak için aşağıdaki bağlantıya tıkla. Bu isteği sen yapmadıysan görmezden gelebilirsin.",
          ctaLabel: "Şifreyi sıfırla",
          url,
        }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: isEmailConfigured(),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendEmail({
        to: user.email,
        subject: "Nexus — E-posta adresini doğrula",
        text: `E-posta adresini doğrulamak için: ${url}`,
        html: actionEmailHtml({
          heading: "E-postanı doğrula",
          body: "Nexus hesabını etkinleştirmek için e-posta adresini doğrula.",
          ctaLabel: "E-postamı doğrula",
          url,
        }),
      });
    },
  },
  socialProviders,
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      // Session revocation and temporary-demo expiry must take effect on the
      // next request. The public portfolio workload does not justify a stale
      // client-side session cache.
      enabled: false,
    },
  },
  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
