# Nexus GitHub + Linear Integration Setup

This guide configures the real integration path. Seeded demo data still works without these credentials, but real GitHub/Linear connect and sync require the values below.

## Required public URLs

Use one canonical app URL for every provider setting.

Local:

```bash
APP_URL=http://localhost:3000
LINEAR_REDIRECT_URI=http://localhost:3000/api/integrations/linear/callback
```

Production example:

```bash
APP_URL=https://nexus.129-154-244-110.sslip.io
LINEAR_REDIRECT_URI=https://nexus.129-154-244-110.sslip.io/api/integrations/linear/callback
```

Provider URLs:

```text
GitHub setup URL:    {APP_URL}/api/integrations/github/setup
GitHub callback URL: {APP_URL}/api/integrations/github/callback
GitHub webhook URL:  {APP_URL}/api/webhooks/github

Linear callback URL: {APP_URL}/api/integrations/linear/callback
Linear webhook URL:  {APP_URL}/api/webhooks/linear
```

## Environment

Generate the encryption key once and keep it stable. If this changes, existing encrypted Linear tokens cannot be decrypted.

```bash
openssl rand -base64 32
```

Set:

```bash
APP_URL=
INTEGRATION_TOKEN_ENCRYPTION_KEY=

GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=

LINEAR_CLIENT_ID=
LINEAR_CLIENT_SECRET=
LINEAR_REDIRECT_URI=
LINEAR_WEBHOOK_SECRET=
```

For production, also keep auth origins aligned:

```bash
BETTER_AUTH_URL={APP_URL}
NEXT_PUBLIC_APP_URL={APP_URL}
AUTH_TRUSTED_ORIGINS={APP_URL}
```

## GitHub App

Create a GitHub App. Do not use a personal access token for Nexus.

Recommended settings:

```text
Homepage URL:        {APP_URL}
Callback URL:        {APP_URL}/api/integrations/github/callback
Setup URL:           {APP_URL}/api/integrations/github/setup
Webhook URL:         {APP_URL}/api/webhooks/github
Webhook secret:      same value as GITHUB_WEBHOOK_SECRET
Expire user auth:    enabled if available
```

Minimum permissions:

```text
Metadata:      Read-only
Issues:        Read and write
Pull requests: Read-only
Checks:        Read-only
Contents:      Read-only
```

Subscribe to events:

```text
Issues
Pull requests
Check runs
Check suites
Push
```

After creating the app:

- Copy App ID to `GITHUB_APP_ID`.
- Copy app slug from the app URL to `GITHUB_APP_SLUG`.
- Copy Client ID and Client secret to `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET`.
- Generate a private key and place the PEM content in `GITHUB_APP_PRIVATE_KEY`.

If the private key is in a single-line env file, encode line breaks as `\n`. The app also accepts a base64-encoded PEM value.

## Linear OAuth

Create a Linear OAuth application.

Recommended settings:

```text
Redirect/callback URL: {APP_URL}/api/integrations/linear/callback
Scopes:                read,write
```

Set:

```bash
LINEAR_CLIENT_ID=
LINEAR_CLIENT_SECRET=
LINEAR_REDIRECT_URI={APP_URL}/api/integrations/linear/callback
```

Create a Linear webhook pointing to:

```text
{APP_URL}/api/webhooks/linear
```

Set the webhook signing secret in:

```bash
LINEAR_WEBHOOK_SECRET=
```

## Local Smoke

Start the app:

```bash
pnpm dev:local
```

In another terminal:

```bash
pnpm smoke:integrations
```

This verifies:

- integration env values exist;
- encryption key is exactly 32 bytes;
- `/api/integrations` is protected by auth;
- GitHub webhook rejects invalid signatures and accepts valid signatures;
- Linear webhook rejects invalid signatures and accepts valid signatures.

It does not complete OAuth. OAuth requires using the UI as the workspace owner.

## Manual Acceptance Flow

1. Sign in as a real owner account, not a public demo session.
2. Open `Settings -> Integrations`.
3. Connect GitHub.
4. Install the GitHub App on the target repository.
5. Return to Nexus and select the repository if multiple repositories are available.
6. Click sync.
7. Connect Linear.
8. Select team/project if multiple teams exist.
9. Click sync.
10. Open a plan and check the impact graph.
11. Edit the plan and run impact analysis.
12. Review proposals. GitHub/Linear proposals should be grouped separately from internal task proposals.
13. Apply selected proposals.
14. For queued external write operations, use the retry/run action in the Changes screen and verify operation status.

## Production Smoke

After deploying updated env values:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
pnpm db:migrate
ENV_FILE=.env.production SMOKE_BASE_URL={APP_URL} pnpm smoke:integrations
```

Then run the manual acceptance flow in the browser.

## Current Limits

- Public demo users cannot connect real providers.
- Webhooks are verified and recorded; targeted incremental sync workers are not yet implemented.
- External writes are queued and auditable. Nexus does not merge PRs or execute repository code.
- GitHub installation tokens are generated on demand and are not stored.
- Linear OAuth tokens are encrypted at rest.
