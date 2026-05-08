# Architecture

## Operating Principle

Always choose strong architecture over ceremony avoidance.

This app is expected to grow from an internal YouTube packaging helper into a SaaS-shaped product. Extra boundaries are worthwhile when they make authentication, authorization, workflow state, secrets, provider integrations, and future tenant-owned configuration clearer.

## System Shape

- Convex is the durable application core for data, authorization, workflows, and sync.
- SvelteKit stays thin: routing, forms, rendering, and light presentation orchestration.
- Business rules live in Convex functions or shared pure helpers.
- External API side effects belong in Convex Actions or Workflows, not in SvelteKit route loads.
- UI should subscribe to persisted Convex state instead of waiting on long synchronous requests.

## Convex Function Categories

Table modules use FUCD naming for raw table access:

- `find`
- `upsert`
- `collect`
- `paginate`
- `count`
- `destroy`

View modules compose read models for screens. They use descriptive `get*` names and do not use FUCD verbs.

Command modules are intent-oriented transactional mutations. They enforce invariants, update records, and may schedule workflow work after recording intent. They should not call external APIs directly.

Workflow modules coordinate external APIs, background jobs, retries, and persisted status. They are implemented with Convex Actions, internal Actions, scheduled functions, or a workflow component when durability requires it.

## Workflow Pattern

Prefer this shape for side-effectful operations:

1. The UI calls a command mutation that records user intent.
2. The command writes or updates a durable job/status record.
3. The command schedules an internal workflow action.
4. The workflow action calls the provider API.
5. The workflow action writes results back through commands or internal mutations.
6. The UI updates through Convex subscriptions.

This keeps the app reactive even when YouTube or Anthropic work takes time.

## Durable Workflow Jobs

Long-running provider work should be represented as a persisted job record. This app uses:

- `aiJobs` for structured description generation, where the result is a typed generated description.
- `workflowJobs` for provider workflows such as YouTube playlist sync, video refresh, caption fetch,
  title update, and authorized channel sync.

SvelteKit actions should request work through Convex commands such as `youtubeCommands.requestPlaylistSync`.
Those commands create or reuse a queued job, schedule an internal workflow action, and return immediately.
Pages should read the latest job status and stored Convex snapshots instead of calling YouTube during page load.

## Backend Workflow Smoke Tests

Use `convex run --identity` to verify guarded Convex commands and scheduled workflows without a
browser session. This is useful when testing YouTube or Anthropic workflow execution from the
backend boundary.

Shape the synthetic identity like a real WorkOS JWT identity. The `user_id` must be a real WorkOS
user with the relevant provider connection, and `org_id` must match the organization that owns the
records being tested:

```sh
pnpm exec convex run youtubeCommands:requestChannelSync '{}' \
  --identity '{
    "subject": "user_...",
    "tokenIdentifier": "https://api.workos.com/|user_...",
    "user_id": "user_...",
    "org_id": "org_...",
    "email": "person@example.com"
  }'
```

This exercises the same public Convex mutation the UI calls, including authz helpers, durable job
creation, scheduled workflow actions, WorkOS Pipes token retrieval, provider API calls, status
recording, and stored result updates.

When verifying YouTube workflows, prefer non-destructive payloads:

- Channel sync: `youtubeCommands.requestChannelSync`.
- Playlist sync: use a small known event playlist.
- Video refresh: use a known video in the current organization.
- Caption fetch: use a known video with captions.
- Title update: submit the video's existing title to exercise the write path without changing
  public metadata.

After queueing work, inspect the persisted job and stored data with readonly queries:

```sh
pnpm exec convex run --inline-query '
  const job = await ctx.db.get("workflow_job_id");
  return job && { task: job.task, status: job.status, result: job.result, error: job.error };
'
```

This pattern does not verify WorkOS login redirects, AuthKit cookies, SvelteKit auth wiring, JWT
issuer/audience configuration, or browser session behavior. Use it as a backend workflow smoke test,
not as a replacement for a real sign-in test.

## Provider And Secret Boundaries

Feature code should not import environment variables or provider token logic directly. Use narrow provider boundaries instead:

```ts
getAnthropicApiKey(ctx);
getWorkosApiKey(ctx);
getYoutubeAccessToken(ctx, input);
```

Current strategy:

- App-owned global secrets live in Convex or host environment variables.
- WorkOS AuthKit is the auth provider; Convex validates WorkOS JWTs and the
  WorkOS AuthKit component owns durable user sync from WorkOS webhooks.
- WorkOS Pipes owns the OAuth provider token lifecycle for YouTube.
- Convex workflow code should call the app's provider boundary rather than importing WorkOS, Google,
  or provider token helpers directly.

## YouTube Credential Execution Model

YouTube provider work should run as the requester, inside the current organization.

The organization owns app records such as events, videos, playlist assignments, captions, workflow
jobs, and connected channel metadata. The user who starts a YouTube workflow owns the provider-side
execution context for that job. Commands should derive `organizationId` and `requestedByUserId` from
the authenticated WorkOS identity, write both values onto `workflowJobs`, and never accept either
value from client arguments.

Workflows should fetch YouTube access through WorkOS Pipes with both values:

```ts
getConnectedYouTubeAccessToken({
	userId: job.requestedByUserId,
	organizationId: job.organizationId
});
```

This means org members share the same app data, but provider side effects are attributable to the
member who requested them. If a member has not connected or authorized YouTube with the needed
scopes, their workflow should fail with a reconnect or authorization error instead of silently
falling back to another member's credentials.

This model preserves a useful audit trail:

- who queued the job
- which organization owned the target record
- which provider connection was used
- whether the provider call completed or failed

If the app later supports true org-owned credentials through WorkOS Vault, BYOK, or a service
account-style provider connection, that should be modeled as an explicit execution mode rather than
as a replacement for run-as-requester.

## Deployment

The UI deploys to Cloudflare Workers through SvelteKit's Cloudflare adapter and Wrangler. Convex remains
the durable backend and workflow runtime. Avoid moving provider side effects back into the Cloudflare
Worker just because it can run server code; the Worker should stay a rendering and form-submission layer.

Future SaaS strategy:

- Tenant-provided provider credentials can move behind the same boundary using WorkOS Vault.
- Vault is a product capability for tenant-owned secrets and BYOK flows, not a reason to spread secret lookup logic across feature code.

## Product Direction

The app should be designed as if it will support multiple organizations, users, connected channels, and tenant-owned credentials. Even when the first implementation is internal-only, do not bake in assumptions that make the SaaS version feel bolted on later.
