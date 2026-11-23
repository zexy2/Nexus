/**
 * Who should see the first-run onboarding modal.
 *
 * Onboarding was effectively disabled in production (the client default was
 * `hasCompletedOnboarding: true`). Turning it on must not surprise people who
 * already use Nexus, and a fresh browser has no local flag, so the server
 * decides eligibility from durable facts:
 *   - accounts created before ONBOARDING_LAUNCH_AT are existing users, and
 *   - anyone whose workspaces already hold docs or tasks is not new.
 * The client then additionally skips it once the local "completed" flag is set.
 */
export const DEFAULT_ONBOARDING_LAUNCH_AT = new Date("2026-11-23T00:00:00.000Z");

/**
 * `ONBOARDING_LAUNCH_AT` (ISO 8601, e.g. "2026-11-23T00:00:00Z") overrides the
 * cutoff; missing or unparseable values fall back to the default. Server-only:
 * the client bundle never sees this variable, and eligibility is decided on
 * the server.
 */
export function resolveOnboardingLaunchAt(
  env: Record<string, string | undefined> = process.env
): Date {
  const raw = env.ONBOARDING_LAUNCH_AT?.trim();
  if (!raw) return DEFAULT_ONBOARDING_LAUNCH_AT;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? DEFAULT_ONBOARDING_LAUNCH_AT : parsed;
}

export const ONBOARDING_LAUNCH_AT = resolveOnboardingLaunchAt();

export function isOnboardingEligible(input: {
  userCreatedAt: Date | string | number | null | undefined;
  hasWorkspaceContent: boolean;
  launchAt?: Date;
}): boolean {
  if (input.hasWorkspaceContent) return false;
  if (input.userCreatedAt === null || input.userCreatedAt === undefined) return false;
  const createdAt = new Date(input.userCreatedAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return createdAt >= (input.launchAt ?? ONBOARDING_LAUNCH_AT).getTime();
}

/** Client gate: server-eligible and not completed/skipped on this device. */
export function shouldShowOnboarding(eligible: boolean, hasCompletedOnboarding: boolean): boolean {
  return eligible && !hasCompletedOnboarding;
}
