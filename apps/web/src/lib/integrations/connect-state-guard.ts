import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceOwner } from "@/lib/workspace-auth";
import {
  consumeIntegrationConnectState,
  readIntegrationConnectState,
  type IntegrationProvider,
} from "@/lib/integrations/crypto";

type ConnectStateRow = NonNullable<Awaited<ReturnType<typeof readIntegrationConnectState>>>;

export type ConnectStateAuthorization =
  | { ok: true; connectState: ConnectStateRow; userId: string }
  | {
      ok: false;
      error: "not_authenticated" | "invalid_state" | "state_user_mismatch" | "workspace_access_denied";
    };

/**
 * Binds an OAuth `state` to the browser that started the connect flow.
 *
 * The state row (hashed, 10-minute TTL, one-time use) already records the
 * initiating user and target workspace. Without this check, an attacker could
 * hand their own `authUrl` to a victim and have the victim's Linear token or
 * GitHub installation linked to the attacker's workspace (login/linking CSRF).
 *
 * Requires that:
 *  - the request carries a valid session,
 *  - the session user is the user who created the state,
 *  - that user still owns the target workspace (same rule as /connect),
 *  - the state is unexpired and unused. With `consume: true` it is claimed
 *    atomically, so a replay or concurrent callback fails.
 *
 * The state is never consumed on a mismatch, so a victim opening an
 * attacker's link cannot burn or use it.
 */
export async function authorizeIntegrationConnectState(
  provider: IntegrationProvider,
  state: string,
  options: { consume: boolean }
): Promise<ConnectStateAuthorization> {
  const session = await verifySession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const pending = await readIntegrationConnectState(provider, state);
  if (!pending) return { ok: false, error: "invalid_state" };

  if (pending.userId !== session.user.id) {
    return { ok: false, error: "state_user_mismatch" };
  }

  const access = await requireWorkspaceOwner(session.user.id, pending.workspaceId);
  if (!access.ok) return { ok: false, error: "workspace_access_denied" };

  if (!options.consume) {
    return { ok: true, connectState: pending, userId: session.user.id };
  }

  const consumed = await claimIntegrationConnectState(provider, state, session.user.id);
  if (!consumed) return { ok: false, error: "invalid_state" };
  return { ok: true, connectState: consumed, userId: session.user.id };
}

/**
 * Atomically consumes the state and re-checks ownership on the claimed row.
 * Use after `authorizeIntegrationConnectState(..., { consume: false })` in
 * multi-step flows, right before persisting the integration.
 */
export async function claimIntegrationConnectState(
  provider: IntegrationProvider,
  state: string,
  userId: string
) {
  const consumed = await consumeIntegrationConnectState(provider, state);
  if (!consumed || consumed.userId !== userId) return null;
  return consumed;
}
