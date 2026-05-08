# YouTube Packager

A SvelteKit and Convex app for linking events to YouTube playlists, validating and generating
formatted video metadata, storing captions, and pushing approved updates back to YouTube.

## Architecture

This project treats Convex as the durable application core for data, authorization, workflows,
and sync. SvelteKit should stay thin: routing, forms, rendering, and light presentation
orchestration.

The core operating principle is:

> Always choose strong architecture over ceremony avoidance.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system shape, Convex function categories,
workflow pattern, and future WorkOS Vault/SaaS secret strategy.

## Environment

Environment is split across two runtimes:

- SvelteKit / Cloudflare Worker env starts AuthKit sessions, handles app routing, and starts
  WorkOS Pipes authorization.
- Convex deployment env runs AuthKit webhooks, durable AI jobs, and YouTube workflows. YouTube
  workflows now call WorkOS Pipes from Convex, so Convex must have its own WorkOS env values.

Create `.env.local` for the SvelteKit / Worker runtime with:

```bash
PUBLIC_CONVEX_URL=your_convex_url
CONVEX_ADMIN_TOKEN=your_convex_deploy_key
WORKOS_CLIENT_ID=your_workos_client_id
WORKOS_API_KEY=your_workos_api_key
WORKOS_REDIRECT_URI=http://localhost:5173/auth/callback
WORKOS_COOKIE_PASSWORD=your_32_character_cookie_password
YOUTUBE_PIPES_PROVIDER=google
```

WorkOS AuthKit is configured for Convex. The WorkOS AuthKit component syncs WorkOS users
into Convex through a webhook at:

```text
https://<your-convex-deployment>.convex.site/workos/webhook
```

Configure that WorkOS webhook for `user.created`, `user.updated`, and `user.deleted`, then set
the signing secret on your Convex deployment:

```sh
pnpm exec convex env set WORKOS_CLIENT_ID <client-id>
pnpm exec convex env set WORKOS_API_KEY <api-key>
pnpm exec convex env set WORKOS_WEBHOOK_SECRET <webhook-secret>
```

YouTube Data API calls use WorkOS Pipes. WorkOS owns the OAuth lifecycle,
credential storage, and token refresh; Convex workflows ask WorkOS for a fresh provider token
when a queued YouTube job runs. Configure the Google provider in Pipes with the YouTube scopes
the app needs.

Convex also needs the Pipes provider when using anything other than the default `google`.
Set it in both `.env.local` and Convex so the authorization UI and background workflows agree:

```sh
pnpm exec convex env set YOUTUBE_PIPES_PROVIDER google
```

AI workflows run in Convex. Set Anthropic values on the Convex deployment:

```sh
pnpm exec convex env set ANTHROPIC_API_KEY <anthropic-api-key>
pnpm exec convex env set ANTHROPIC_MODEL claude-haiku-4-5-20251001
pnpm exec convex env set ANTHROPIC_DESCRIPTION_MODEL claude-opus-4-7
pnpm exec convex env set ANTHROPIC_DESCRIPTION_EFFORT high
```

## Development

Install dependencies and start the dev server:

```sh
pnpm install
pnpm run dev
```

## Building And Deployment

The SvelteKit app is configured with `@sveltejs/adapter-cloudflare` and deploys as a
Cloudflare Worker through Wrangler. The Worker handles routing and rendering; durable data,
authorization checks, AI work, and YouTube provider side effects run in Convex.

To create a production build:

```sh
pnpm run build
```

To preview the Worker locally:

```sh
pnpm run preview:worker
```

To deploy to Cloudflare:

```sh
pnpm run deploy
```

Cloudflare Worker configuration lives in [`wrangler.jsonc`](./wrangler.jsonc).
