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

Create `.env.local` with:

```bash
PUBLIC_CONVEX_URL=your_convex_url
CONVEX_ADMIN_TOKEN=your_convex_deploy_key
GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5173/integrations/youtube/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=base64_32_byte_secret
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_DESCRIPTION_MODEL=claude-opus-4-7
ANTHROPIC_DESCRIPTION_EFFORT=high
```

YouTube Data API calls use the connected Google OAuth account. The app stores the
Google refresh token encrypted in Convex and uses `CONVEX_ADMIN_TOKEN` to call the
internal Convex functions that read/write that connection.

Generate `GOOGLE_TOKEN_ENCRYPTION_KEY` with:

```sh
openssl rand -base64 32
```

`ANTHROPIC_API_KEY` is used server-side for spelling, grammar, and readability checks on
video titles. You can optionally set `ANTHROPIC_MODEL`; otherwise the app uses
`claude-haiku-4-5-20251001`. Structured description generation uses
`ANTHROPIC_DESCRIPTION_MODEL`; otherwise the app uses `claude-opus-4-7`. For Opus 4.7
description generation, `ANTHROPIC_DESCRIPTION_EFFORT` defaults to `high`.

Title AI validation runs through Convex workflows. Set the same Anthropic values on the
Convex deployment:

```sh
pnpm exec convex env set ANTHROPIC_API_KEY
pnpm exec convex env set ANTHROPIC_MODEL claude-haiku-4-5-20251001
```

## Development

Install dependencies and start the dev server:

```sh
pnpm install
pnpm run dev
```

## Building

To create a production version of your app:

```sh
pnpm run build
```

You can preview the production build with `pnpm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
