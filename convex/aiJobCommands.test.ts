/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob('./**/*.ts');

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}

function playlistVideo(overrides: Partial<{ youtubeVideoId: string; title: string }> = {}) {
	const youtubeVideoId = overrides.youtubeVideoId ?? 'video-1';

	return {
		playlistItemId: 'playlist-item-1',
		youtubeVideoId,
		title: overrides.title ?? 'Build Agent-Native Auth',
		position: 0,
		videoUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
		playlistVideoUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}&list=PL123`,
		studioEditUrl: `https://studio.youtube.com/video/${youtubeVideoId}/edit`
	};
}

async function createVideo(t: ReturnType<typeof convexTest>) {
	const event = await t.mutation(api.events.upsert, {
		name: 'MCP Night',
		editionTitle: 'Auth for Agents',
		year: 2026
	});
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [playlistVideo()]
		}
	});

	const video = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	if (!video) {
		throw new Error('Test video was not created.');
	}

	return video;
}

async function addCaption(t: ReturnType<typeof convexTest>, videoId: Id<'videos'>) {
	return await t.mutation(internal.videoCaptions.upsertByVideoIdAndCaptionTrackIdInternal, {
		videoId,
		caption: {
			captionTrackId: 'caption-1',
			language: 'en',
			name: 'English',
			trackKind: 'standard',
			format: 'srt',
			body: `1
00:00:00,000 --> 00:00:30,000
Agent-native auth changes how product teams think about secure sessions.

2
00:01:00,000 --> 00:01:30,000
We design safer sessions by making authentication explicit and observable.

3
00:02:00,000 --> 00:02:30,000
The final step is shipping the integration without surprising users.

4
00:03:30,000 --> 00:04:00,000
Teams should leave with a practical path for their own implementation.
`
		}
	});
}

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

test('requestDescriptionGeneration reports missing captions without creating a job', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const video = await createVideo(t);

	await expect(
		t.mutation(api.aiJobCommands.requestDescriptionGeneration, {
			videoId: video._id
		})
	).resolves.toEqual({
		job: null,
		error: 'Fetch captions before generating a structured description.'
	});

	await expect(
		t.query(api.aiJobViews.getLatestDescriptionGenerationForVideo, {
			videoId: video._id
		})
	).resolves.toBeNull();
});

test('requestDescriptionGeneration creates a queued durable job', async () => {
	vi.useFakeTimers();
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const video = await createVideo(t);
	const caption = await addCaption(t, video._id);
	const result = await t.mutation(api.aiJobCommands.requestDescriptionGeneration, {
		videoId: video._id
	});

	expect(result.error).toBeNull();
	expect(result.job).toMatchObject({
		task: 'descriptionGeneration',
		status: 'queued',
		videoId: video._id,
		captionId: caption?._id
	});

	await expect(
		t.query(api.aiJobViews.getLatestDescriptionGenerationForVideo, {
			videoId: video._id
		})
	).resolves.toMatchObject({
		_id: result.job!._id,
		status: 'queued'
	});
});

test('scheduled description workflow records completed job result', async () => {
	vi.useFakeTimers();
	vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
		jsonResponse({
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						hook: 'Agent-native auth is changing how teams ship secure products.',
						metadata: [
							{
								label: 'Speaker',
								value: 'Chan, Developer Advocate, WorkOS'
							}
						],
						chapters: [
							{ timestamp: '0:00', title: 'Why agent auth matters' },
							{ timestamp: '1:00', title: 'Designing safer sessions' },
							{ timestamp: '2:00', title: 'Shipping the integration' }
						],
						links: [
							{
								label: 'WorkOS',
								url: 'https://workos.com',
								placeholder: ''
							}
						],
						description:
							'Agent-native auth is changing how teams ship secure products.\n\nSpeaker: Chan, Developer Advocate, WorkOS'
					})
				}
			]
		})
	);
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const video = await createVideo(t);

	await addCaption(t, video._id);
	await t.mutation(api.videoCommands.assignSpeaker, {
		videoId: video._id,
		name: 'Chan',
		company: 'WorkOS',
		position: 'Developer Advocate'
	});
	await t.mutation(api.aiJobCommands.requestDescriptionGeneration, {
		videoId: video._id
	});

	await t.finishAllScheduledFunctions(() => vi.runAllTimers());

	const latestJob = await t.query(api.aiJobViews.getLatestDescriptionGenerationForVideo, {
		videoId: video._id
	});
	const request = fetchMock.mock.calls[0][1] as RequestInit;
	const body = JSON.parse(request.body as string);
	const prompt = body.messages[0].content as string;

	expect(fetchMock).toHaveBeenCalledTimes(1);
	expect(prompt).toContain('Build Agent-Native Auth');
	expect(prompt).toContain('"name": "Chan"');
	expect(prompt).toContain('"position": "Developer Advocate"');
	expect(prompt).toContain('"company": "WorkOS"');
	expect(prompt).toContain('MCP Night: Auth for Agents');
	expect(latestJob).toMatchObject({
		status: 'complete',
		result: {
			hook: 'Agent-native auth is changing how teams ship secure products.',
			chapterTarget: 3,
			durationSeconds: 240
		}
	});
});
