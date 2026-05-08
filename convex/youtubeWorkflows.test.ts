/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const organizationId = 'org_test';
const requestedByUserId = 'user_test';
const youtubeAccessToken = 'youtube-access-token';
const youtubeWriteScope = 'https://www.googleapis.com/auth/youtube.force-ssl';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}

function textResponse(body: string, status = 200) {
	return new Response(body, {
		status,
		headers: {
			'Content-Type': 'text/plain'
		}
	});
}

function testIdentity() {
	return {
		subject: requestedByUserId,
		tokenIdentifier: requestedByUserId,
		issuer: 'https://api.workos.com',
		user_id: requestedByUserId,
		org_id: organizationId
	};
}

async function seedVideo(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		return await ctx.db.insert('videos', {
			organizationId,
			youtubeVideoId: 'video-1',
			title: 'Old YouTube Title',
			description: 'Existing local description',
			videoUrl: 'https://www.youtube.com/watch?v=video-1',
			studioEditUrl: 'https://studio.youtube.com/video/video-1/edit',
			lastFetchedAt: Date.now()
		});
	});
}

function workosTokenResponse() {
	return jsonResponse({
		active: true,
		access_token: {
			object: 'access_token',
			access_token: youtubeAccessToken,
			expires_at: '2026-01-01T00:00:00.000Z',
			scopes: [youtubeWriteScope],
			missing_scopes: []
		}
	});
}

function urlFromFetchInput(input: Parameters<typeof fetch>[0]) {
	if (typeof input === 'string') {
		return new URL(input);
	}

	if (input instanceof URL) {
		return input;
	}

	return new URL(input.url);
}

function requestBody(init: Parameters<typeof fetch>[1]) {
	if (!init?.body || typeof init.body !== 'string') {
		return null;
	}

	return JSON.parse(init.body) as unknown;
}

function expectBearerToken(init: Parameters<typeof fetch>[1]) {
	const headers = new Headers(init?.headers);

	expect(headers.get('authorization')).toBe(`Bearer ${youtubeAccessToken}`);
}

function expectWorkosPipesRequest(
	input: Parameters<typeof fetch>[0],
	init: Parameters<typeof fetch>[1]
) {
	const url = urlFromFetchInput(input);
	const headers = new Headers(init?.headers);

	expect(url.href).toBe('https://api.workos.com/data-integrations/google/token');
	expect(init?.method).toBe('POST');
	expect(headers.get('authorization')).toBe('Bearer sk_test_youtube_workflows');
	expect(requestBody(init)).toEqual({
		user_id: requestedByUserId,
		organization_id: organizationId
	});
}

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

test('scheduled title update workflow patches only the YouTube title and records local state', async () => {
	vi.useFakeTimers();
	vi.stubEnv('WORKOS_API_KEY', 'sk_test_youtube_workflows');
	vi.stubEnv('YOUTUBE_PIPES_PROVIDER', 'google');
	const youtubePutBodies: unknown[] = [];
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = urlFromFetchInput(input);

		if (url.hostname === 'api.workos.com') {
			expectWorkosPipesRequest(input, init);
			return workosTokenResponse();
		}

		if (url.hostname !== 'www.googleapis.com') {
			throw new Error(`Unexpected fetch host: ${url.href}`);
		}

		expectBearerToken(init);

		if (url.pathname === '/youtube/v3/videos' && init?.method === 'PUT') {
			youtubePutBodies.push(requestBody(init));
			expect(url.searchParams.get('part')).toBe('snippet');
			return jsonResponse({
				id: 'video-1',
				snippet: {
					title: 'New YouTube Title'
				}
			});
		}

		if (url.pathname === '/youtube/v3/videos') {
			expect(url.searchParams.get('part')).toBe('snippet');
			expect(url.searchParams.get('id')).toBe('video-1');
			expect(url.searchParams.get('maxResults')).toBe('1');
			return jsonResponse({
				items: [
					{
						id: 'video-1',
						snippet: {
							title: 'Old YouTube Title',
							description: 'Existing YouTube description',
							tags: ['identity', 'saas'],
							categoryId: '28',
							defaultLanguage: 'en'
						}
					}
				]
			});
		}

		throw new Error(`Unexpected YouTube fetch: ${url.href}`);
	});
	const t = convexTest(schema, modules).withIdentity(testIdentity());
	const videoId = await seedVideo(t);
	const result = await t.mutation(api.youtubeCommands.requestTitleUpdate, {
		videoId,
		title: ' New YouTube Title '
	});

	expect(result.error).toBeNull();
	expect(result.job).toMatchObject({
		organizationId,
		requestedByUserId,
		task: 'youtubeTitleUpdate',
		status: 'queued',
		videoId
	});

	await t.finishAllScheduledFunctions(() => vi.runAllTimers());

	const video = await t.run(async (ctx) => await ctx.db.get(videoId));
	const latestJob = await t.query(api.workflowJobViews.getLatestForVideoTask, {
		videoId,
		task: 'youtubeTitleUpdate'
	});

	expect(fetchMock).toHaveBeenCalledTimes(3);
	expect(youtubePutBodies).toEqual([
		{
			id: 'video-1',
			snippet: {
				title: 'New YouTube Title',
				categoryId: '28',
				description: 'Existing YouTube description',
				tags: ['identity', 'saas'],
				defaultLanguage: 'en'
			}
		}
	]);
	expect(video?.title).toBe('New YouTube Title');
	expect(video?.description).toBe('Existing local description');
	expect(latestJob?.status).toBe('complete');
	expect(JSON.parse(latestJob?.result ?? '{}')).toEqual({ title: 'New YouTube Title' });
});

test('scheduled caption fetch workflow downloads the best available SRT track', async () => {
	vi.useFakeTimers();
	vi.stubEnv('WORKOS_API_KEY', 'sk_test_youtube_workflows');
	vi.stubEnv('YOUTUBE_PIPES_PROVIDER', 'google');
	const srtBody = `1
00:00:00,000 --> 00:00:03,000
Welcome to the event.

2
00:00:03,000 --> 00:00:07,000
This is the important caption text.
`;
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = urlFromFetchInput(input);

		if (url.hostname === 'api.workos.com') {
			expectWorkosPipesRequest(input, init);
			return workosTokenResponse();
		}

		if (url.hostname !== 'www.googleapis.com') {
			throw new Error(`Unexpected fetch host: ${url.href}`);
		}

		expectBearerToken(init);

		if (url.pathname === '/youtube/v3/captions') {
			expect(url.searchParams.get('part')).toBe('id,snippet');
			expect(url.searchParams.get('videoId')).toBe('video-1');
			return jsonResponse({
				items: [
					{
						id: 'caption-es-auto',
						snippet: {
							videoId: 'video-1',
							language: 'es',
							name: 'Spanish automatic',
							trackKind: 'ASR',
							isAutoSynced: true,
							status: 'serving'
						}
					},
					{
						id: 'caption-en-auto',
						snippet: {
							videoId: 'video-1',
							language: 'en',
							name: 'English automatic',
							trackKind: 'ASR',
							isAutoSynced: true,
							status: 'serving'
						}
					},
					{
						id: 'caption-en-standard',
						snippet: {
							videoId: 'video-1',
							language: 'en',
							name: 'English',
							trackKind: 'standard',
							isAutoSynced: false,
							status: 'serving'
						}
					}
				]
			});
		}

		if (url.pathname === '/youtube/v3/captions/caption-en-standard') {
			expect(url.searchParams.get('tfmt')).toBe('srt');
			return textResponse(srtBody);
		}

		throw new Error(`Unexpected YouTube fetch: ${url.href}`);
	});
	const t = convexTest(schema, modules).withIdentity(testIdentity());
	const videoId = await seedVideo(t);
	const result = await t.mutation(api.youtubeCommands.requestCaptionFetch, { videoId });

	expect(result.error).toBeNull();
	expect(result.job).toMatchObject({
		organizationId,
		requestedByUserId,
		task: 'youtubeCaptionFetch',
		status: 'queued',
		videoId
	});

	await t.finishAllScheduledFunctions(() => vi.runAllTimers());

	const captions = await t.query(internal.videoCaptions.collectByVideoIdInternal, {
		videoId
	});
	const latestJob = await t.query(api.workflowJobViews.getLatestForVideoTask, {
		videoId,
		task: 'youtubeCaptionFetch'
	});

	expect(fetchMock).toHaveBeenCalledTimes(3);
	expect(captions).toHaveLength(1);
	expect(captions[0]).toMatchObject({
		organizationId,
		videoId,
		youtubeVideoId: 'video-1',
		captionTrackId: 'caption-en-standard',
		language: 'en',
		name: 'English',
		trackKind: 'standard',
		isAutoSynced: false,
		status: 'serving',
		format: 'srt',
		body: srtBody
	});
	expect(latestJob?.status).toBe('complete');
	expect(JSON.parse(latestJob?.result ?? '{}')).toEqual({
		captionTrackId: 'caption-en-standard',
		language: 'en'
	});
});
