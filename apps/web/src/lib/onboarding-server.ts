import { db } from "@/lib/db";
import { docs, tasks } from "@nexus/database/schema";
import { inArray } from "drizzle-orm";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-auth";
import { isOnboardingEligible } from "@/lib/onboarding";
import { isDemoEmail } from "@/lib/production-guardrails";

/**
 * Server-side onboarding eligibility (see lib/onboarding.ts). Fails closed:
 * any error means "existing user", so a DB hiccup never pops the modal for
 * someone who already uses the app.
 */
export async function getOnboardingEligibility(
  userId: string,
  userCreatedAt: Date | string | null | undefined,
  email?: string | null
): Promise<boolean> {
  // Demo sessions land on a seeded workspace; the modal would only obstruct
  // the guided demo (and its E2E flows).
  if (isDemoEmail(email)) return false;
  // Cheap check first: accounts older than the launch never qualify.
  if (!isOnboardingEligible({ userCreatedAt, hasWorkspaceContent: false })) return false;
  try {
    const workspaceIds = await getAccessibleWorkspaceIds(userId);
    if (workspaceIds.length === 0) return true;
    const [doc] = await db
      .select({ id: docs.id })
      .from(docs)
      .where(inArray(docs.workspaceId, workspaceIds))
      .limit(1);
    if (doc) return false;
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.workspaceId, workspaceIds))
      .limit(1);
    return isOnboardingEligible({ userCreatedAt, hasWorkspaceContent: Boolean(task) });
  } catch (error) {
    console.error("[Onboarding] Eligibility check failed:", error);
    return false;
  }
}
