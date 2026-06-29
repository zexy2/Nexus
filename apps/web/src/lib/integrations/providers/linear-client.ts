import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/integrations/crypto";

type LinearTokenPayload = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
};

type LinearGraphqlError = Error & { body?: unknown };

export type LinearTeam = {
  id: string;
  key: string;
  name: string;
};

export type LinearProject = {
  id: string;
  name: string;
  teamIds: string[];
};

export type LinearIssue = {
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

export function getLinearConfig() {
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

export async function linearGraphql<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch("https://api.linear.app/graphql", {
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
  const data = await linearGraphql<{ issues: { nodes: LinearIssue[] } }>(
    accessToken,
    `query NexusLinearIssues($teamId: String, $projectId: String) {
      issues(first: 100, ${filter} orderBy: updatedAt) {
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
      }
    }`,
    variables
  );
  return data.issues.nodes;
}

export async function performLinearWrite(
  accessToken: string,
  operationType: string,
  payload: Record<string, unknown>
) {
  if (operationType === "linear_comment") {
    const issueId = typeof payload.issueId === "string" ? payload.issueId : null;
    const body = typeof payload.body === "string" ? payload.body : payload.comment;
    if (!issueId || typeof body !== "string" || body.trim().length === 0) {
      throw new Error("Linear comment requires payload.issueId and payload.body");
    }
    return linearGraphql(accessToken, `mutation NexusComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id url } }
    }`, { issueId, body });
  }

  if (operationType === "linear_update_issue") {
    const issueId = typeof payload.issueId === "string" ? payload.issueId : null;
    if (!issueId) throw new Error("Linear update requires payload.issueId");
    const input: Record<string, unknown> = {};
    if (typeof payload.title === "string") input.title = payload.title;
    if (typeof payload.description === "string") input.description = payload.description;
    if (typeof payload.stateId === "string") input.stateId = payload.stateId;
    if (Object.keys(input).length === 0) {
      throw new Error("Linear update requires at least one mutable field");
    }
    return linearGraphql(accessToken, `mutation NexusIssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success issue { id identifier url } }
    }`, { id: issueId, input });
  }

  if (operationType === "linear_create_issue") {
    const teamId = typeof payload.teamId === "string" ? payload.teamId : null;
    const title = typeof payload.title === "string" ? payload.title : null;
    if (!teamId || !title) throw new Error("Linear create requires payload.teamId and payload.title");
    return linearGraphql(accessToken, `mutation NexusIssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { id identifier url } }
    }`, {
      input: {
        teamId,
        title,
        description: typeof payload.description === "string" ? payload.description : undefined,
        projectId: typeof payload.projectId === "string" ? payload.projectId : undefined,
      },
    });
  }

  throw new Error(`Unsupported Linear operation: ${operationType}`);
}
