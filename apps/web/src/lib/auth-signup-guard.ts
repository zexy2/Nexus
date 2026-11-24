import { isPublicSignupEnabled, writeAuditLog } from "@/lib/production-guardrails";

/**
 * better-auth `databaseHooks.user.create.before` guard.
 *
 * The `/api/auth/[...all]` route only filters `/sign-up/*` paths, but social
 * sign-in (`/sign-in/social` + `/callback/<provider>`) can create users too.
 * Every user that better-auth creates goes through this hook, so blocking
 * here enforces `PUBLIC_SIGNUP_ENABLED=false` for all better-auth signup paths.
 *
 * Existing users are never created again: signing in (including social
 * sign-in that links a provider to an existing account) does not run it.
 * Demo identities are inserted directly through Drizzle (`lib/demo-sessions`)
 * and are not affected.
 *
 * Returning `false` makes better-auth abort the creation (1.x contract).
 */
export async function beforeUserCreate<T>(user: T): Promise<false | { data: T }> {
  if (!isPublicSignupEnabled()) {
    await writeAuditLog({
      event: "auth.signup_blocked",
      status: "blocked",
      metadata: { path: "user.create" },
    });
    return false;
  }
  return { data: user };
}
