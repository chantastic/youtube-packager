# Convex to Cloudflare Migration Plan

Last reviewed: 2026-05-08

This document is an exploratory source of truth for future sessions. It assumes a migration from
Convex to Cloudflare is possible, but not a direct backend swap. The current app intentionally uses
Convex as the durable application core, so a Cloudflare migration should allow for architecture
changes, selective migration, and possible feature degradation where that makes the product simpler
or safer to operate.

## Summary

The app already deploys its SvelteKit UI to Cloudflare Workers. The difficult migration work is the
backend: Convex currently owns durable data, authorization checks, WorkOS AuthKit webhook/component
sync, background job scheduling, provider workflows, and typed function boundaries.

A realistic Cloudflare target shape is:

- SvelteKit on Cloudflare Workers, as today.
- D1 for relational app data.
- Cloudflare Workflows or Queues for YouTube and AI background jobs.
- Durable Objects for coordination and realtime job/event streams, not as the primary app database.
- WorkOS webhooks plus app-owned auth sync tables to replace `@convex-dev/workos-authkit`.

The safest path is not a big-bang rewrite. Start with migration seams that reduce Convex dependence
while Convex remains the source of truth, then move durable data and workflows once the replacement
semantics are proven.

## Current Convex Surface Area

Convex is used for more than storage:

- Durable app data: `organizations`, `youtubeChannels`, `events`, `videos`, `speakers`,
  `videoSpeakers`, `videoCaptions`, `playlistAssignments`, `eventPlaylistStats`,
  `aiValidationChecks`, `aiJobs`, and `workflowJobs`.
- Auth and authorization: Convex validates WorkOS JWTs, derives `organizationId` and
  `requestedByUserId`, and enforces organization-scoped access inside public functions.
- WorkOS AuthKit component sync: `@convex-dev/workos-authkit` registers the WorkOS webhook route,
  syncs user data into component-owned tables, exposes `authKit.getAuthUser`, and runs additional
  organization event handlers.
- Background jobs: Convex commands write durable job records and then use
  `ctx.scheduler.runAfter(0, ...)` to start internal workflow actions.
- Provider workflows: YouTube and Anthropic side effects run in Convex actions, then write results
  back through Convex mutations.
- Typed backend API: SvelteKit calls generated Convex function references through `api.*` and uses
  generated return types in route code.
- Realtime-ish UX: the app does not currently appear to use direct Convex client subscriptions in
  Svelte components. Job status is mostly refreshed by SvelteKit invalidation polling while jobs are
  active.

## Hard-To-Part Features

These are the features most likely to make the migration expensive or risky.

### WorkOS AuthKit Component Shadow Database

This is the hardest conceptual cut. Cloudflare has no drop-in equivalent for the Convex AuthKit
component's synced auth tables, event helpers, and component-owned storage.

A Cloudflare port needs:

- A WorkOS webhook receiver in Workers.
- Signature verification against raw request bodies.
- A durable `workosEvents` or equivalent dedupe table keyed by WorkOS event ID.
- App-owned `users`, `organizations`, and eventually membership or role tables.
- Idempotent handlers for user and organization create/update/delete events.
- A reconciliation path using WorkOS APIs or Events API for missed or historical data.

Do not replace this with request-time WorkOS API lookups everywhere. That would make auth and
authorization slower, less durable, and harder to reason about.

### Convex Mutation Semantics

Convex gives transaction boundaries and consistent mutation behavior inside its database runtime.
Moving to D1 means the app must explicitly model:

- SQL transactions.
- Unique constraints and upsert behavior.
- Idempotency keys for workflow requests and webhook processing.
- Conflict behavior for duplicate job creation and repeated provider syncs.
- Retention cleanup for terminal jobs.

The current code depends on patterns like "create or reuse an in-flight workflow job" and
"record intent, then schedule work." Those should be preserved as explicit service-layer contracts.

### Atomic Job Handoff

Today commands write `workflowJobs` or `aiJobs` and immediately schedule an internal Convex action.
The important invariant is that user intent is recorded durably before provider work begins.

Cloudflare replacements need to avoid the "job row written but work never started" and "work started
but job row missing" failure modes. Likely options:

- Cloudflare Workflows for durable multi-step jobs.
- Queues for simpler background execution with retry and dead-letter handling.
- A transactional outbox in D1, drained by scheduled Workers or Queues.

YouTube title updates, caption fetches, playlist sync, video refresh, and channel sync should not be
the first migration unless this handoff is already proven.

### Typed Generated API

SvelteKit route code currently imports generated Convex function references and return types. A
Cloudflare port needs an explicit replacement boundary:

- Internal service functions for server-side calls.
- HTTP/RPC handlers if frontend code needs direct calls.
- Shared TypeScript types for route loads, actions, and service outputs.
- A testing strategy that replaces `convex-test` coverage.

This is a maintainability issue as much as a typing issue. Without a deliberate boundary, business
logic can leak back into SvelteKit routes.

### Organization-Scoped Authorization

Convex functions currently derive the WorkOS user and organization server-side. The app should keep
that principle:

- Never accept `organizationId`, `userId`, or `requestedByUserId` from client arguments for
  authorization.
- Derive auth context in a narrow Worker/service helper.
- Apply organization constraints in every read and write.
- Preserve `requestedByUserId` on workflow jobs for auditability and WorkOS Pipes token retrieval.

This is central to the SaaS direction and should not be degraded casually.

### AI Validation Cache

The `aiValidationChecks` cache avoids repeated Anthropic calls. It is not large, but it is valuable
and keyed by a precise cache identity:

- Organization.
- Video.
- Field.
- Check ID.
- Input hash.
- Model.
- Prompt version.
- Model config hash.

This is a good selective migration candidate because it is bounded, measurable, and relatively
independent from YouTube provider workflows.

### Playlist And Video Read Models

Event and video pages compose data from multiple tables, validation helpers, speakers,
assignments, captions, workflow status, and title-check inputs. D1 can support this, but the
view-building layer must be rebuilt deliberately.

The migration should preserve screen-level read models rather than forcing route files to manually
join and validate everything.

### Provider Execution As Requester

YouTube provider work currently runs as the requesting WorkOS user within the current organization.
Workflows fetch access through WorkOS Pipes using both `requestedByUserId` and `organizationId`.

Keep this invariant:

- App records are organization-owned.
- Provider side effects are attributable to the requesting user.
- Missing user authorization should fail with reconnect/reauthorization errors.
- Do not silently fall back to anonymous org-level credentials.

## Selective Migration Candidates

These are good early moves because they reduce risk without requiring the whole app to leave Convex.

### 1. Mirror WorkOS Webhook Ingestion To Cloudflare

Build a Cloudflare Worker endpoint for WorkOS webhooks and mirror user/organization events into D1
while Convex remains source of truth.

This directly attacks the hardest future dependency: the AuthKit component shadow database. It also
creates a place to prove webhook verification, event dedupe, idempotent handlers, and reconciliation.

Success criteria:

- WorkOS event signatures are verified from raw bodies.
- Duplicate events are ignored by event ID.
- Organization create/update/delete parity matches Convex behavior.
- User lifecycle data is available in D1 for future authz expansion.
- Convex still powers production behavior until the mirror is trusted.

### 2. Add Durable Object Job Status Broadcasts

Keep Convex job records for now, but introduce Durable Objects for realtime status delivery.

Good object boundaries:

- Per organization job stream.
- Per event playlist.
- Per video detail page.
- Per workflow job, if streams are very narrow.

This can replace or reduce the current 1.5s polling loop without moving durable workflow storage
yet. Durable Objects are a strong fit for WebSocket or SSE coordination, connection fanout, and
short-lived realtime presence around active jobs.

Success criteria:

- Active pages receive job updates without polling.
- Reconnects still fall back to durable job status from Convex or D1.
- Object state is treated as coordination state, not the canonical database.

### 3. Move WorkOS Pipes Connection UI Further Into Workers

Much of the Pipes connection UI already runs in SvelteKit server code. This is a low-risk path
because WorkOS should continue to own the OAuth lifecycle, token refresh, and credential storage.

Success criteria:

- Worker code can check Pipes connection status.
- Worker code can generate the provider authorization URL.
- Provider tokens are never cached client-side.
- Background jobs still fetch provider tokens as the requesting user.

### 4. Move AI Title-Check Cache To D1 Behind An Interface

The AI validation cache is bounded and has clear keys. It is a useful D1 pilot before migrating
core workflow jobs or application data.

Success criteria:

- Cache read/write parity with Convex.
- Unique constraint prevents duplicate cache entries.
- Existing prompt/model/config cache invalidation behavior is preserved.
- Anthropic call count does not regress.

### 5. Keep YouTube Workflows In Convex Until Cloudflare Workflow Semantics Are Proven

YouTube workflows are side-effectful, user-attributed, and operationally important. They should move
after job handoff, retries, idempotency, and status persistence are already demonstrated elsewhere.

## Features That Could Be Limited To Ease Migration

These product constraints would make a Cloudflare migration easier if feature degradation is
acceptable:

- Treat job progress as status refresh only, not full realtime collaboration.
- Keep only the current "10 most recent terminal jobs per stream" history rule.
- Avoid adding broader audit/event history until the new job system exists.
- Cap playlist sync sizes explicitly and surface the cap in product behavior.
- Keep title alternatives and AI title checks as request/response tools.
- Avoid expanding auth complexity beyond organization membership until the WorkOS mirror is stable.
- Delay tenant-owned credential modes until the provider boundary is settled.

## Cloudflare Target Architecture

### Workers And SvelteKit

Keep SvelteKit on Cloudflare Workers. The Worker should continue to own routing, forms, rendering,
AuthKit session handling, and lightweight orchestration.

Avoid moving business logic into individual route files. Instead, create a backend service layer that
SvelteKit route loads/actions call.

### D1

Use D1 for durable relational data:

- Model current Convex tables as SQL tables.
- Translate Convex indexes into SQL indexes and unique constraints.
- Use foreign keys where they clarify ownership and cleanup.
- Keep `organizationId` on organization-scoped tables.
- Add explicit timestamps where Convex currently provides `_creationTime`.
- Batch large backfills and destructive operations.

D1 is likely the default durable store for app records, workflow job records, auth mirror data, and
AI validation cache.

### Durable Objects

Use Durable Objects for coordination, not as the app's primary relational database:

- Realtime job/event/video streams.
- Per-org or per-resource WebSocket/SSE fanout.
- Lightweight locking or sequencing around hot resources if needed.
- Short-lived connection state.

Do not put all app state in one Durable Object. That would create a global bottleneck and make data
access patterns harder to evolve.

### Workflows, Queues, And Outbox

Use Cloudflare Workflows for multi-step provider operations that need durable execution, retries,
and persisted progress. Use Queues for simpler asynchronous jobs.

For critical handoffs, use a transactional outbox pattern:

1. Worker validates auth and input.
2. Worker writes the durable job row in D1.
3. Worker writes an outbox row or starts a Workflow.
4. Background worker marks the job running.
5. Background worker calls WorkOS Pipes, YouTube, or Anthropic.
6. Background worker writes results and terminal status.
7. Durable Object stream broadcasts the update if active clients exist.

### WorkOS Auth And Events

Keep WorkOS AuthKit for authentication. Replace the Convex AuthKit component with explicit
Cloudflare-owned sync:

- AuthKit SvelteKit session handling in Workers.
- WorkOS JWT/session-derived auth context for server operations.
- WorkOS webhook receiver for lifecycle events.
- D1 tables for synced users, organizations, memberships, and event processing.
- WorkOS Pipes as the provider token lifecycle owner.

### Provider Boundaries

Preserve narrow provider helpers:

- `getWorkosApiKey`.
- `getYoutubeAccessToken`.
- `getAnthropicApiKey`.
- Future WorkOS Vault or tenant-owned secret lookups.

Feature code should not import environment variables or provider SDKs broadly.

## Migration Sequence

1. Inventory and freeze current Convex behavior with golden tests around auth, event/video views,
   job creation, and provider workflow status.
2. Add Cloudflare WorkOS webhook mirror to D1 while Convex remains production source of truth.
3. Add Durable Object job-status broadcast in parallel with existing polling.
4. Move AI validation cache to D1 behind a shared interface.
5. Build the Cloudflare service layer and D1 schema for core app records.
6. Migrate read models for event list/detail and video detail.
7. Move low-risk commands such as event create/update/delete and metadata edits.
8. Prove Cloudflare Workflows or Queues with non-destructive jobs.
9. Move YouTube workflows last, preserving run-as-requester behavior.
10. Retire Convex only after D1 data, WorkOS sync, workflows, and authz tests have parity.

## Test Plan

No runtime tests are required for this document itself. For the migration work, use these acceptance
tests:

- Auth context: authenticated user, anonymous user, missing organization, wrong organization, and
  stale auth data.
- WorkOS event ingestion: signature verification, duplicate event ID, out-of-order update/delete,
  and reconciliation/backfill.
- Data migration: row counts, unique-key parity, representative event/video views, captions, and
  speaker assignments.
- Commands: event upsert/delete, video metadata updates, title validation settings, speaker
  assignment/removal.
- Job lifecycle: duplicate request reuses in-flight jobs where expected, title update always creates
  a new job, running/complete/error transitions, terminal retention limit.
- Provider workflows: missing Pipes connection, missing scopes, YouTube API failure, Anthropic
  failure, retry behavior, and final persisted status.
- Realtime: Durable Object connect, broadcast, reconnect, stale auth, inactive-client fallback, and
  durable status recovery.

## Assumptions

- Cloudflare is the preferred infrastructure partner for future deployment.
- WorkOS AuthKit remains the authentication system.
- WorkOS Pipes continues to own YouTube OAuth provider token lifecycle.
- The app should preserve organization-scoped data ownership and requester-attributed provider work.
- Selective feature limitation is acceptable if it reduces migration risk.
- Convex can remain in production during early Cloudflare migration stages.
- This document reflects the codebase shape inspected on 2026-05-08 and should be refreshed as the
  app changes.

## Source Links

- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Durable Object SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Durable Object WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare Workflows](https://developers.cloudflare.com/workflows/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/reference/how-queues-works/)
- [WorkOS webhooks](https://workos.com/docs/events/data-syncing/webhooks)
- [WorkOS Pipes](https://workos.com/docs/pipes)
- [Convex realtime](https://docs.convex.dev/realtime)
- [Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions)
- [Convex WorkOS AuthKit](https://docs.convex.dev/auth/authkit/)
