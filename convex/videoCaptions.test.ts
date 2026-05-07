/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function video(overrides: { youtubeVideoId?: string; title?: string } = {}) {
	const youtubeVideoId = overrides.youtubeVideoId ?? 'video-1';

	return {
		playlistItemId: `playlist-item-${youtubeVideoId}`,
		youtubeVideoId,
		title: overrides.title ?? 'A playlist video',
		position: 0,
		videoUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
		playlistVideoUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}&list=PL123`,
		studioEditUrl: `https://studio.youtube.com/video/${youtubeVideoId}/edit`
	};
}

async function seedVideo(t: ReturnType<typeof convexTest>) {
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });

	await t.mutation(api.videoCommands.recordPlaylistSnapshotByEventId, {
		eventId: event!._id,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'testconf-2026',
			validationStats: [],
			videos: [video()]
		}
	});

	const seededVideo = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	return seededVideo!._id;
}

test('upsert stores and replaces captions by video ID and caption track ID', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const videoId = await seedVideo(t);

	const created = await t.mutation(
		internal.videoCaptions.upsertByVideoIdAndCaptionTrackIdInternal,
		{
			videoId,
			caption: {
				captionTrackId: 'caption-1',
				language: 'en',
				name: 'English',
				trackKind: 'standard',
				isAutoSynced: false,
				status: 'serving',
				format: 'srt',
				body: '1\n00:00:00,000 --> 00:00:01,000\nHello'
			}
		}
	);
	const replaced = await t.mutation(
		internal.videoCaptions.upsertByVideoIdAndCaptionTrackIdInternal,
		{
			videoId,
			caption: {
				captionTrackId: 'caption-1',
				language: 'en',
				name: 'English updated',
				trackKind: 'standard',
				isAutoSynced: true,
				status: 'serving',
				format: 'srt',
				body: '1\n00:00:00,000 --> 00:00:01,000\nUpdated'
			}
		}
	);
	const captions = await t.query(internal.videoCaptions.collectByVideoIdInternal, {
		videoId
	});

	expect(replaced?._id).toBe(created?._id);
	expect(captions).toHaveLength(1);
	expect(captions[0]).toMatchObject({
		captionTrackId: 'caption-1',
		language: 'en',
		name: 'English updated',
		isAutoSynced: true,
		body: '1\n00:00:00,000 --> 00:00:01,000\nUpdated'
	});
});

test('collectByVideoIdInternal sorts captions by newest fetch first', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const videoId = await seedVideo(t);

	vi.useFakeTimers();
	try {
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		await t.mutation(internal.videoCaptions.upsertByVideoIdAndCaptionTrackIdInternal, {
			videoId,
			caption: {
				captionTrackId: 'caption-1',
				language: 'en',
				format: 'srt',
				body: 'First'
			}
		});

		vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));
		await t.mutation(internal.videoCaptions.upsertByVideoIdAndCaptionTrackIdInternal, {
			videoId,
			caption: {
				captionTrackId: 'caption-2',
				language: 'es',
				format: 'srt',
				body: 'Second'
			}
		});
	} finally {
		vi.useRealTimers();
	}

	const captions = await t.query(internal.videoCaptions.collectByVideoIdInternal, {
		videoId
	});

	expect(captions.map((caption) => caption.captionTrackId)).toEqual(['caption-2', 'caption-1']);
});

test('upsert rejects captions when the video has not been ingested', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const missingVideoId = await t.run(async (ctx) => {
		const id = await ctx.db.insert('videos', {
			organizationId: 'org_test',
			youtubeVideoId: 'deleted-video',
			title: 'Deleted video',
			videoUrl: 'https://www.youtube.com/watch?v=deleted-video',
			studioEditUrl: 'https://studio.youtube.com/video/deleted-video/edit',
			lastFetchedAt: Date.now()
		});

		await ctx.db.delete(id);
		return id;
	});

	await expect(
		t.mutation(internal.videoCaptions.upsertByVideoIdAndCaptionTrackIdInternal, {
			videoId: missingVideoId,
			caption: {
				captionTrackId: 'caption-1',
				format: 'srt',
				body: 'Missing video'
			}
		})
	).rejects.toThrow('Video not found.');
});
