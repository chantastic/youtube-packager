# YouTube Playlist Helper

A SvelteKit app for linking events to YouTube playlists, previewing formatted video titles,
and jumping into YouTube Studio for manual edits.

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
`claude-haiku-4-5-20251001`.

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
