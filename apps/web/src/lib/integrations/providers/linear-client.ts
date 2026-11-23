import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/integrations/crypto";

type LinearTokenPayload = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
};

type LinearGraphqlError = Error & { body?: unknown };

type LinearTeam = {
  id: string;
  key: string;
  name: string;
};

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  priority: number;
  state: { name: string };
  team: { id: string; key: string; name: string };
  project: { id: string; name: string } | null;
  labels: { nodes: Array<{ name: string }> };
  updatedAt: string;
};

/** Per-request timeout for Linear API and OAuth calls. */
const LINEAR_FETCH_TIMEOUT_MS = 15_000;
/** Upper bound on issue pages followed per sync (100 issues per page). */
const LINEAR_MAX_PAGES = 10;

function getLinearConfig() {
  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Linear OAuth environment is incomplete");
  }
  return { clientId, clientSecret };
}

export async function exchangeLinearOAuthCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getLinearConfig();
  const response = await fetch("https://api.linear.app/oauth/token", {
    signal: AbortSignal.timeout(LINEAR_FETCH_TIMEOUT_MS),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error || !body.access_token) {
    throw new Error(body.error_description || body.error || "Linear OAuth code exchange failed");
  }
  return encryptIntegrationSecret({
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: typeof body.expires_in === "number" ? Date.now() + body.expires_in * 1000 : undefined,
    scope: body.scope,
  } satisfies LinearTokenPayload);
}

async function refreshLinearOAuthToken(refreshToken: string) {
  const { clientId, clientSecret } = getLinearConfig();
  const response = await fetch("https://api.linear.app/oauth/token", {
    signal: AbortSignal.timeout(LINEAR_FETCH_TIMEOUT_MS),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error || !body.access_token) {
    throw new Error(body.error_description || body.error || "Linear token refresh failed");
  }
  return {
    encrypted: encryptIntegrationSecret({
      accessToken: body.access_token,
      refreshToken: body.refresh_token || refreshToken,
      expiresAt: typeof body.expires_in === "number" ? Date.now() + body.expires_in * 1000 : undefined,
      scope: body.scope,
    } satisfies LinearTokenPayload),
    accessToken: body.access_token as string,
  };
}

export async function resolveLinearAccessToken(encrypted: string) {
  const token = decryptIntegrationSecret<LinearTokenPayload>(encrypted);
  if (token.expiresAt && token.expiresAt < Date.now() + 60_000 && token.refreshToken) {
    return refreshLinearOAuthToken(token.refreshToken);
  }
  return { encrypted: null, accessToken: token.accessToken };
}

async function linearGraphql<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch("https://api.linear.app/graphql", {
    signal: AbortSignal.timeout(LINEAR_FETCH_TIMEOUT_MS),
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    const error = new Error(body.errors?.[0]?.message || `Linear API failed: ${response.status}`) as LinearGraphqlError;
    error.body = body;
    throw error;
  }
  return body.data as T;
}

export async function getLinearViewer(accessToken: string) {
  return linearGraphql<{
    viewer: { id: string; name: string; email: string; organization: { id: string; name: string; urlKey: string } };
  }>(
    accessToken,
    `query Viewer {
      viewer {
        id
        name
        email
        organization { id name urlKey }
      }
    }`
  );
}

export async function listLinearResources(accessToken: string) {
  const data = await linearGraphql<{
    teams: { nodes: LinearTeam[] };
    projects: { nodes: Array<{ id: string; name: string; teams: { nodes: LinearTeam[] } }> };
  }>(
    accessToken,
    `query NexusLinearResources {
      teams(first: 100) { nodes { id key name } }
      projects(first: 100) { nodes { id name teams { nodes { id key name } } } }
    }`
  );
  return {
    teams: data.teams.nodes,
    projects: data.projects.nodes.map((project) => ({
      id: project.id,
      name: project.name,
      teamIds: project.teams.nodes.map((team) => team.id),
    })),
  };
}

export async function listLinearIssues(
  accessToken: string,
  input: { teamId?: string; projectId?: string | null }
) {
  const filters: string[] = [];
  const variables: Record<string, unknown> = {};
  if (input.teamId) {
    filters.push("team: { id: { eq: $teamId } }");
    variables.teamId = input.teamId;
  }
  if (input.projectId) {
    filters.push("project: { id: { eq: $projectId } }");
    variables.projectId = input.projectId;
  }
  const filter = filters.length > 0 ? `filter: { ${filters.join(", ")} },` : "";
  const query = `query NexusLinearIssues($teamId: String, $projectId: String, $after: String) {
      issues(first: 100, after: $after, ${filter} orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          description
          url
          priority
          updatedAt
          state { name }
          team { id key name }
          project { id name }
          labels { nodes { name } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;
  const issues: LinearIssue[] = [];
  let after: string | null = null;
  for (let page = 0; page < LINEAR_MAX_PAGES; page += 1) {
    const data: {
      issues: { nodes: LinearIssue[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } };
    } = await linearGraphql(accessToken, query, { ...variables, after });
    issues.push(...data.issues.nodes);
    const pageInfo = data.issues.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }
  return issues;
}
