/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

type VideoSnapshot = {
	playlistItemId: string;
	youtubeVideoId: string;
	title: string;
	position: number;
	videoUrl: string;
	playlistVideoUrl: string;
	studioEditUrl: string;
};

function video(overrides: Partial<VideoSnapshot> = {}) {
	const youtubeVideoId = overrides.youtubeVideoId ?? 'video-1';

	return {
		playlistItemId: 'playlist-item-1',
		youtubeVideoId,
		title: 'A playlist video',
		position: 0,
		videoUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
		playlistVideoUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}&list=PL123`,
		studioEditUrl: `https://studio.youtube.com/video/${youtubeVideoId}/edit`,
		...overrides
	};
}

test('syncPlaylistForEvent stores top-level videos, assignments, and event stats', async () => {
	const t = convexTest(schema, modules);
	const eventId = await t.mutation(api.events.create, { name: 'TestConf', year: 2026 });

	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId,
		playlist: {
			playlistId: 'PL123',
			title: 'TestConf videos',
			channelTitle: 'Test Channel',
			itemCount: 2,
			validationContextKey: 'testconf-2026',
			validationStats: [
				{
					id: 'title-event-suffix',
					label: 'Title suffix',
					passCount: 1,
					failCount: 1,
					infoCount: 0
				}
			],
			videos: [
				video({
					playlistItemId: 'playlist-item-2',
					youtubeVideoId: 'video-2',
					title: 'Second video',
					position: 1
				}),
				video()
			]
		}
	});

	const assignments = await t.query(api.videos.listAssignmentsByEvent, { eventId });
	const videoDoc = await t.query(api.videos.getByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});
	const stats = await t.query(api.videos.getStatsByEventIds, {
		eventIds: [eventId]
	});

	expect(assignments.map((item) => item.video.youtubeVideoId)).toEqual(['video-1', 'video-2']);
	expect(assignments[0].assignment).toMatchObject({
		eventId,
		playlistId: 'PL123',
		playlistItemId: 'playlist-item-1',
		youtubeVideoId: 'video-1',
		position: 0
	});
	expect(videoDoc).toMatchObject({
		youtubeVideoId: 'video-1',
		title: 'A playlist video',
		videoType: 'talk'
	});
	expect(stats).toHaveLength(1);
	expect(stats[0]).toMatchObject({
		eventId,
		playlistId: 'PL123',
		playlistTitle: 'TestConf videos',
		playlistChannelTitle: 'Test Channel',
		playlistItemCount: 2,
		validationContextKey: 'testconf-2026',
		videoCount: 2,
		validationStats: [
			{
				id: 'title-event-suffix',
				passCount: 1,
				failCount: 1,
				infoCount: 0
			}
		]
	});
});

test('event type sets the default video type for ingested videos', async () => {
	const t = convexTest(schema, modules);
	const eventId = await t.mutation(api.events.create, {
		name: 'Customer Chats',
		eventType: 'interviews',
		year: 2026
	});

	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'customer-chats-2026',
			validationStats: [],
			videos: [video({ youtubeVideoId: 'interview-1', title: 'Customer interview' })]
		}
	});

	const videoDoc = await t.query(api.videos.getByYoutubeVideoId, {
		youtubeVideoId: 'interview-1'
	});

	expect(videoDoc).toMatchObject({
		youtubeVideoId: 'interview-1',
		videoType: 'interview'
	});
});

test('syncPlaylistForEvent replaces stale assignments without duplicating videos', async () => {
	const t = convexTest(schema, modules);
	const eventId = await t.mutation(api.events.create, { name: 'TestConf', year: 2026 });

	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'testconf-2026',
			validationStats: [],
			videos: [
				video({ playlistItemId: 'playlist-item-1', youtubeVideoId: 'video-1', position: 0 }),
				video({ playlistItemId: 'playlist-item-2', youtubeVideoId: 'video-2', position: 1 })
			]
		}
	});
	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'testconf-2026',
			validationStats: [],
			videos: [
				video({
					playlistItemId: 'playlist-item-2',
					youtubeVideoId: 'video-2',
					title: 'Updated title',
					position: 0
				})
			]
		}
	});

	const assignments = await t.query(api.videos.listAssignmentsByEvent, { eventId });
	const stats = await t.query(api.videos.getStatsByEventIds, {
		eventIds: [eventId]
	});

	expect(assignments).toHaveLength(1);
	expect(assignments[0].assignment).toMatchObject({
		playlistItemId: 'playlist-item-2',
		youtubeVideoId: 'video-2',
		position: 0
	});
	expect(assignments[0].video).toMatchObject({
		youtubeVideoId: 'video-2',
		title: 'Updated title'
	});
	expect(stats[0].videoCount).toBe(1);
});

test('speaker assignments and video title format survive playlist syncs', async () => {
	const t = convexTest(schema, modules);
	const eventId = await t.mutation(api.events.create, { name: 'TestConf', year: 2026 });

	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'testconf-2026',
			validationStats: [],
			videos: [video({ youtubeVideoId: 'video-1', title: 'Original title' })]
		}
	});
	await t.mutation(api.videos.updateMetadata, {
		youtubeVideoId: 'video-1',
		titleOverride: 'A Fully Custom Video Title',
		videoTitleFormat: '{title} — {speaker}, {company}',
		videoType: 'panelDiscussion'
	});
	await t.mutation(api.videos.addSpeaker, {
		youtubeVideoId: 'video-1',
		name: 'Chan',
		company: 'WorkOS',
		position: 'Developer Advocate'
	});
	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'testconf-2026',
			validationStats: [],
			videos: [video({ youtubeVideoId: 'video-1', title: 'Updated title' })]
		}
	});

	const videoDoc = await t.query(api.videos.getByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});
	const videoView = await t.query(api.videos.getViewByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	expect(videoDoc).toMatchObject({
		youtubeVideoId: 'video-1',
		title: 'Updated title',
		titleOverride: 'A Fully Custom Video Title',
		videoTitleFormat: '{title} — {speaker}, {company}',
		videoType: 'panelDiscussion'
	});
	expect(videoView?.speakers).toHaveLength(1);
	expect(videoView?.speakers[0].speaker).toMatchObject({
		name: 'Chan',
		company: 'WorkOS',
		position: 'Developer Advocate'
	});
});

test('video title override can be cleared', async () => {
	const t = convexTest(schema, modules);
	const eventId = await t.mutation(api.events.create, { name: 'TestConf', year: 2026 });

	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'testconf-2026',
			validationStats: [],
			videos: [video({ youtubeVideoId: 'video-1', title: 'Original title' })]
		}
	});
	await t.mutation(api.videos.updateMetadata, {
		youtubeVideoId: 'video-1',
		titleOverride: 'A Fully Custom Video Title'
	});
	await t.mutation(api.videos.updateMetadata, {
		youtubeVideoId: 'video-1',
		clearTitleOverride: true
	});

	const videoDoc = await t.query(api.videos.getByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	expect(videoDoc?.titleOverride).toBeUndefined();
});

test('existing speakers can be assigned to another video', async () => {
	const t = convexTest(schema, modules);
	const eventId = await t.mutation(api.events.create, { name: 'TestConf', year: 2026 });

	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'testconf-2026',
			validationStats: [],
			videos: [
				video({ youtubeVideoId: 'video-1', title: 'First talk' }),
				video({ youtubeVideoId: 'video-2', title: 'Second talk' })
			]
		}
	});
	await t.mutation(api.videos.addSpeaker, {
		youtubeVideoId: 'video-1',
		name: 'Chan',
		company: 'WorkOS',
		position: 'Developer Advocate'
	});

	const speakers = await t.query(api.videos.listSpeakers, {});

	await t.mutation(api.videos.addSpeaker, {
		youtubeVideoId: 'video-2',
		speakerId: speakers[0]._id
	});

	const videoView = await t.query(api.videos.getViewByYoutubeVideoId, {
		youtubeVideoId: 'video-2'
	});

	expect(speakers).toHaveLength(1);
	expect(videoView?.speakers).toHaveLength(1);
	expect(videoView?.speakers[0].speaker).toMatchObject({
		name: 'Chan',
		company: 'WorkOS',
		position: 'Developer Advocate'
	});
});

test('video title can be updated after a YouTube metadata write', async () => {
	const t = convexTest(schema, modules);
	const eventId = await t.mutation(api.events.create, { name: 'TestConf', year: 2026 });

	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'testconf-2026',
			validationStats: [],
			videos: [video({ youtubeVideoId: 'video-1', title: 'Old title' })]
		}
	});
	await t.mutation(api.videos.updateTitle, {
		youtubeVideoId: 'video-1',
		title: 'New title'
	});

	const videoDoc = await t.query(api.videos.getByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	expect(videoDoc?.title).toBe('New title');
});

test('a video can have assignments in multiple playlists', async () => {
	const t = convexTest(schema, modules);
	const firstEventId = await t.mutation(api.events.create, { name: 'FirstConf', year: 2026 });
	const secondEventId = await t.mutation(api.events.create, { name: 'SecondConf', year: 2026 });

	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId: firstEventId,
		playlist: {
			playlistId: 'PL123',
			validationContextKey: 'firstconf-2026',
			validationStats: [],
			videos: [video({ youtubeVideoId: 'shared-video' })]
		}
	});
	await t.mutation(api.videos.syncPlaylistForEvent, {
		eventId: secondEventId,
		playlist: {
			playlistId: 'PL456',
			validationContextKey: 'secondconf-2026',
			validationStats: [],
			videos: [
				video({
					playlistItemId: 'playlist-item-99',
					youtubeVideoId: 'shared-video',
					playlistVideoUrl: 'https://www.youtube.com/watch?v=shared-video&list=PL456'
				})
			]
		}
	});

	const videoDoc = await t.query(api.videos.getByYoutubeVideoId, {
		youtubeVideoId: 'shared-video'
	});
	expect(videoDoc).not.toBeNull();

	const assignments = await t.query(api.videos.listAssignmentsByVideo, {
		videoId: videoDoc!._id
	});
	const videoView = await t.query(api.videos.getViewByYoutubeVideoId, {
		youtubeVideoId: 'shared-video'
	});

	expect(assignments).toHaveLength(2);
	expect(assignments.map((assignment) => assignment.playlistId).sort()).toEqual(['PL123', 'PL456']);
	expect(videoView?.video.youtubeVideoId).toBe('shared-video');
	expect(videoView?.assignments.map((row) => row.event.name).sort()).toEqual([
		'FirstConf',
		'SecondConf'
	]);
});
