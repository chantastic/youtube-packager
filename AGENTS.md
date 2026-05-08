## Architecture Principles

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the human-facing system overview.

- Always choose strong architecture over ceremony avoidance.
- Convex is the durable application core for data, authorization, workflows, and sync.
- SvelteKit should stay thin: routing, forms, rendering, and light presentation orchestration.
- Business logic belongs in Convex functions or shared pure helpers.
- External API side effects belong in Convex Actions or Workflows once a workflow is moved.
- UI should subscribe to persisted Convex state instead of depending on long synchronous requests.
- Secrets must be accessed through a narrow boundary, never imported directly across feature code.
- Prefer app-owned Convex environment variables now, while keeping the boundary compatible with future WorkOS Vault tenant secrets.
- WorkOS Pipes or Connected Apps should own OAuth provider token lifecycle when available.
- YouTube provider workflows run as the requesting WorkOS user inside the current organization; preserve `requestedByUserId` for auditability instead of falling back to anonymous org-level credentials.

## Convex Function Categories

- Table modules use FUCD naming for raw data access.
- Views compose read models for screens.
- Commands are intent-oriented transactional mutations.
- Workflows coordinate external APIs, background jobs, retries, and persisted status.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
