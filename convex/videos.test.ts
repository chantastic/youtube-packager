/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

type VideoSnapshot = {
	playlistItemId: string;
	youtubeVideoId: string;
	youtubeChannelId?: string;
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
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			youtubeChannelId: 'UC123',
			title: 'TestConf videos',
			channelTitle: 'Test Channel',
			itemCount: 2,
			videos: [
				video({
					playlistItemId: 'playlist-item-2',
					youtubeVideoId: 'video-2',
					youtubeChannelId: 'UC123',
					title: 'Second video',
					position: 1
				}),
				video({ youtubeChannelId: 'UC123' })
			]
		}
	});

	const assignments = await t.query(api.playlistAssignmentViews.getForEvent, { eventId });
	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});
	const stats = await t.query(api.eventPlaylistStats.collectByEventId, {
		eventIds: [eventId]
	});

	expect(assignments.map((item) => item.video.youtubeVideoId)).toEqual(['video-1', 'video-2']);
	expect(assignments[0].assignment).toMatchObject({
		organizationId: 'org_test',
		eventId,
		playlistId: 'PL123',
		playlistItemId: 'playlist-item-1',
		youtubeVideoId: 'video-1',
		position: 0
	});
	expect(videoDoc).toMatchObject({
		organizationId: 'org_test',
		youtubeChannelId: 'UC123',
		youtubeVideoId: 'video-1',
		title: 'A playlist video',
		videoType: 'talk'
	});
	const updatedEvent = await t.query(api.events.find, { id: eventId });
	const youtubeChannel = await t.run(async (ctx) => {
		return await ctx.db
			.query('youtubeChannels')
			.withIndex('by_organizationId_and_youtubeChannelId', (q) =>
				q.eq('organizationId', 'org_test').eq('youtubeChannelId', 'UC123')
			)
			.unique();
	});

	expect(updatedEvent).toMatchObject({ youtubeChannelId: 'UC123' });
	expect(youtubeChannel).toMatchObject({
		organizationId: 'org_test',
		youtubeChannelId: 'UC123',
		title: 'Test Channel'
	});
	expect(stats).toHaveLength(1);
	expect(stats[0]).toMatchObject({
		organizationId: 'org_test',
		youtubeChannelId: 'UC123',
		eventId,
		playlistId: 'PL123',
		playlistTitle: 'TestConf videos',
		playlistChannelTitle: 'Test Channel',
		playlistItemCount: 2,
		videoCount: 2
	});
});

test('video view resolves both canonical ids and YouTube video ids', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'youtube-video-id' })]
		}
	});

	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'youtube-video-id'
	});
	const canonicalRoute = await t.query(api.videoViews.getByRouteParam, {
		routeParam: videoDoc!._id
	});
	const youtubeRoute = await t.query(api.videoViews.getByRouteParam, {
		routeParam: 'youtube-video-id'
	});

	expect(canonicalRoute?.kind).toBe('id');
	expect(canonicalRoute?.videoView.video._id).toBe(videoDoc!._id);
	expect(youtubeRoute?.kind).toBe('youtubeVideoId');
	expect(youtubeRoute?.videoView.video._id).toBe(videoDoc!._id);
});

test('event type sets the default video type for ingested videos', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, {
		name: 'Customer Chats',
		eventType: 'interviews',
		year: 2026
	});
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'interview-1', title: 'Customer interview' })]
		}
	});

	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'interview-1'
	});

	expect(videoDoc).toMatchObject({
		youtubeVideoId: 'interview-1',
		videoType: 'interview'
	});
});

test('syncPlaylistForEvent replaces stale assignments without duplicating videos', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [
				video({ playlistItemId: 'playlist-item-1', youtubeVideoId: 'video-1', position: 0 }),
				video({ playlistItemId: 'playlist-item-2', youtubeVideoId: 'video-2', position: 1 })
			]
		}
	});
	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
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

	const assignments = await t.query(api.playlistAssignmentViews.getForEvent, { eventId });
	const stats = await t.query(api.eventPlaylistStats.collectByEventId, {
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
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'video-1', title: 'Original title' })]
		}
	});
	const originalVideoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	await t.mutation(api.videoCommands.setMetadata, {
		videoId: originalVideoDoc!._id,
		titleOverride: 'A Fully Custom Video Title',
		videoTitleFormat: '{title} — {speaker}, {company}',
		videoType: 'panelDiscussion'
	});
	await t.mutation(api.videoCommands.setDisabledTitleValidations, {
		videoId: originalVideoDoc!._id,
		disabledTitleValidationIds: ['profile', 'mechanics']
	});
	await t.mutation(api.videoCommands.assignSpeaker, {
		videoId: originalVideoDoc!._id,
		name: 'Chan',
		company: 'WorkOS',
		position: 'Developer Advocate'
	});
	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'video-1', title: 'Updated title' })]
		}
	});

	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});
	const videoView = await t.query(api.videoViews.get, {
		id: videoDoc!._id
	});

	expect(videoDoc).toMatchObject({
		youtubeVideoId: 'video-1',
		title: 'Updated title',
		titleOverride: 'A Fully Custom Video Title',
		videoTitleFormat: '{title} — {speaker}, {company}',
		videoType: 'panelDiscussion',
		disabledTitleValidationIds: ['profile', 'mechanics']
	});
	expect(videoView?.speakers).toHaveLength(1);
	expect(videoView?.speakers[0].speaker).toMatchObject({
		name: 'Chan',
		company: 'WorkOS',
		position: 'Developer Advocate'
	});
});

test('video title override can be cleared', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'video-1', title: 'Original title' })]
		}
	});
	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	await t.mutation(api.videoCommands.setMetadata, {
		videoId: videoDoc!._id,
		titleOverride: 'A Fully Custom Video Title'
	});
	await t.mutation(api.videoCommands.setMetadata, {
		videoId: videoDoc!._id,
		clearTitleOverride: true
	});

	const updatedVideoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	expect(updatedVideoDoc?.titleOverride).toBeUndefined();
});

test('disabled title validations can be cleared', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'video-1', title: 'Original title' })]
		}
	});
	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	await t.mutation(api.videoCommands.setDisabledTitleValidations, {
		videoId: videoDoc!._id,
		disabledTitleValidationIds: ['event', 'format', 'event']
	});
	await t.mutation(api.videoCommands.setDisabledTitleValidations, {
		videoId: videoDoc!._id,
		disabledTitleValidationIds: []
	});

	const updatedVideoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	expect(updatedVideoDoc?.disabledTitleValidationIds).toBeUndefined();
});

test('existing speakers can be assigned to another video', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [
				video({ youtubeVideoId: 'video-1', title: 'First talk' }),
				video({ youtubeVideoId: 'video-2', title: 'Second talk' })
			]
		}
	});
	const firstVideoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});
	const secondVideoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-2'
	});

	await t.mutation(api.videoCommands.assignSpeaker, {
		videoId: firstVideoDoc!._id,
		name: 'Chan',
		company: 'WorkOS',
		position: 'Developer Advocate'
	});

	const speakers = await t.query(api.speakers.collect, {});

	await t.mutation(api.videoCommands.assignSpeaker, {
		videoId: secondVideoDoc!._id,
		speakerId: speakers[0]._id
	});

	const videoView = await t.query(api.videoViews.get, {
		id: secondVideoDoc!._id
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
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'video-1', title: 'Old title' })]
		}
	});
	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	await t.mutation(internal.videoCommands.recordTitleInternal, {
		organizationId: 'org_test',
		videoId: videoDoc!._id,
		title: 'New title'
	});

	const updatedVideoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	expect(updatedVideoDoc?.title).toBe('New title');
});

test('video can be refreshed from YouTube without clearing app metadata', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'video-1', title: 'Old title' })]
		}
	});
	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	await t.mutation(api.videoCommands.setMetadata, {
		videoId: videoDoc!._id,
		titleOverride: 'Manual override',
		videoType: 'keynote'
	});
	await t.mutation(internal.videoCommands.recordYoutubeSnapshotInternal, {
		organizationId: 'org_test',
		videoId: videoDoc!._id,
		youtubeVideoId: 'video-1',
		title: 'Fresh title',
		description: 'Fresh description',
		videoUrl: 'https://www.youtube.com/watch?v=video-1',
		studioEditUrl: 'https://studio.youtube.com/video/video-1/edit',
		thumbnailUrl: 'https://img.youtube.com/vi/video-1/hqdefault.jpg',
		channelTitle: 'Fresh Channel',
		publishedAt: '2026-01-01T00:00:00Z',
		videoPublishedAt: '2026-01-01T00:00:00Z'
	});

	const updatedVideoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	expect(updatedVideoDoc).toMatchObject({
		youtubeVideoId: 'video-1',
		title: 'Fresh title',
		description: 'Fresh description',
		titleOverride: 'Manual override',
		videoType: 'keynote',
		channelTitle: 'Fresh Channel'
	});
});

test('video refresh rejects snapshots for a different YouTube video', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const event = await t.mutation(api.events.upsert, { name: 'TestConf', year: 2026 });
	const eventId = event!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'video-1', title: 'Old title' })]
		}
	});
	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	await expect(
		t.mutation(internal.videoCommands.recordYoutubeSnapshotInternal, {
			organizationId: 'org_test',
			videoId: videoDoc!._id,
			youtubeVideoId: 'different-video',
			title: 'Wrong video',
			videoUrl: 'https://www.youtube.com/watch?v=different-video',
			studioEditUrl: 'https://studio.youtube.com/video/different-video/edit'
		})
	).rejects.toThrow('YouTube snapshot does not match this video.');
});

test('a video can have assignments in multiple playlists', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});
	const firstEvent = await t.mutation(api.events.upsert, { name: 'FirstConf', year: 2026 });
	const firstEventId = firstEvent!._id;
	const secondEvent = await t.mutation(api.events.upsert, { name: 'SecondConf', year: 2026 });
	const secondEventId = secondEvent!._id;

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId: firstEventId,
		playlist: {
			playlistId: 'PL123',
			videos: [video({ youtubeVideoId: 'shared-video' })]
		}
	});
	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId: secondEventId,
		playlist: {
			playlistId: 'PL456',
			videos: [
				video({
					playlistItemId: 'playlist-item-99',
					youtubeVideoId: 'shared-video',
					playlistVideoUrl: 'https://www.youtube.com/watch?v=shared-video&list=PL456'
				})
			]
		}
	});

	const videoDoc = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'shared-video'
	});
	expect(videoDoc).not.toBeNull();

	const assignments = await t.query(api.playlistAssignments.collectByVideoId, {
		videoId: videoDoc!._id
	});
	const videoView = await t.query(api.videoViews.get, {
		id: videoDoc!._id
	});

	expect(assignments).toHaveLength(2);
	expect(assignments.map((assignment) => assignment.playlistId).sort()).toEqual(['PL123', 'PL456']);
	expect(videoView?.video.youtubeVideoId).toBe('shared-video');
	expect(videoView?.assignments.map((row) => row.event.name).sort()).toEqual([
		'FirstConf',
		'SecondConf'
	]);
	expect(videoView?.titleAiInputs.map((input) => input.checkId).sort()).toEqual([
		'hook',
		'mechanics'
	]);
	expect(
		videoView?.assignments
			.map((row) => ({
				eventName: row.event.name,
				baselineChecks: row.baselineValidations.map((validation) => validation.id).sort(),
				aiChecks: row.titleAiInputs.map((input) => input.checkId).sort()
			}))
			.sort((a, b) => a.eventName.localeCompare(b.eventName))
	).toEqual([
		{
			eventName: 'FirstConf',
			baselineChecks: ['event', 'format', 'profile'],
			aiChecks: ['hook', 'mechanics']
		},
		{
			eventName: 'SecondConf',
			baselineChecks: ['event', 'format', 'profile'],
			aiChecks: ['hook', 'mechanics']
		}
	]);
});
