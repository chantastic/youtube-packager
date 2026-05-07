# Architecture

## Operating Principle

Always choose strong architecture over ceremony avoidance.

This app is expected to grow from an internal YouTube packaging helper into a SaaS-shaped product. Extra boundaries are worthwhile when they make authentication, authorization, workflow state, secrets, provider integrations, and future tenant-owned configuration clearer.

## System Shape

- Convex is the durable application core for data, authorization, workflows, and sync.
- SvelteKit stays thin: routing, forms, rendering, and light presentation orchestration.
- Business rules live in Convex functions or shared pure helpers.
- External API side effects belong in Convex Actions or Workflows once a workflow is moved.
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

## Provider And Secret Boundaries

Feature code should not import environment variables or provider token logic directly. Use narrow provider boundaries instead:

```ts
getAnthropicApiKey(ctx)
getWorkosApiKey(ctx)
getYoutubeAccessToken(ctx, input)
```

Current strategy:

- App-owned global secrets live in Convex or host environment variables.
- WorkOS Pipes or Connected Apps should own OAuth provider token lifecycle when available.

Future SaaS strategy:

- Tenant-provided provider credentials can move behind the same boundary using WorkOS Vault.
- Vault is a product capability for tenant-owned secrets and BYOK flows, not a reason to spread secret lookup logic across feature code.

## Product Direction

The app should be designed as if it will support multiple organizations, users, connected channels, and tenant-owned credentials. Even when the first implementation is internal-only, do not bake in assumptions that make the SaaS version feel bolted on later.
