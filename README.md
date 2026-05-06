# YouTube Playlist Helper

A SvelteKit app for linking events to YouTube playlists, previewing formatted video titles,
and jumping into YouTube Studio for manual edits.

## Environment

Create `.env.local` with:

```bash
PUBLIC_CONVEX_URL=your_convex_url
YOUTUBE_API_KEY=your_youtube_data_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

`YOUTUBE_API_KEY` is used server-side for public, read-only YouTube Data API calls:
playlist metadata, playlist videos, thumbnails, and video links.

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
