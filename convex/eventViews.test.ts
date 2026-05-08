/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function identityForOrg(organizationId: string) {
	return {
		subject: `user_${organizationId}`,
		tokenIdentifier: `user_${organizationId}`,
		issuer: 'https://api.workos.com',
		org_id: organizationId
	};
}

function playlistVideo(title = 'Agentic Auth - Chan, WorkOS | MCP Night 2026') {
	return {
		playlistItemId: 'playlist-item-1',
		youtubeVideoId: 'video-1',
		title,
		position: 0,
		videoUrl: 'https://www.youtube.com/watch?v=video-1',
		playlistVideoUrl: 'https://www.youtube.com/watch?v=video-1&list=PL123',
		studioEditUrl: 'https://studio.youtube.com/video/video-1/edit'
	};
}

async function seedEventViewData(t: ReturnType<typeof convexTest>) {
	const event = await t.mutation(api.events.upsert, {
		name: 'MCP Night',
		year: 2026,
		youtubePlaylistId: 'PL123'
	});

	await t.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_test',
		eventId: event!._id,
		playlist: {
			playlistId: 'PL123',
			title: 'MCP Night playlist',
			channelTitle: 'WorkOS',
			itemCount: 1,
			validationContextKey: 'mcp-night-2026',
			validationStats: [],
			videos: [playlistVideo()]
		}
	});

	const video = await t.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});

	await t.mutation(api.videoCommands.assignSpeaker, {
		videoId: video!._id,
		name: 'Chan',
		company: 'WorkOS',
		position: 'Developer Advocate'
	});

	return { event: event!, video: video! };
}

test('getList returns composed event rows for the authenticated organization', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});

	const { event, video } = await seedEventViewData(t);
	const items = await t.query(api.eventViews.getList, {});

	expect(items).toHaveLength(1);
	expect(items[0].event).toMatchObject({
		_id: event._id,
		name: 'MCP Night',
		year: 2026
	});
	expect(items[0].playlistStats).toMatchObject({
		playlistId: 'PL123',
		playlistTitle: 'MCP Night playlist',
		playlistChannelTitle: 'WorkOS',
		playlistItemCount: 1
	});
	expect(items[0].videos).toHaveLength(1);
	expect(items[0].videos[0].video._id).toBe(video._id);
	expect(items[0].videos[0].speakers.map((row) => row.speaker.name)).toEqual(['Chan']);
	expect(items[0].videos[0].baselineValidations.map((validation) => validation.id)).toEqual([
		'profile',
		'event',
		'format'
	]);
	expect(items[0].videos[0].titleAiInputs.map((input) => input.checkId)).toEqual([
		'hook',
		'mechanics'
	]);
});

test('getDetail hides events from other organizations', async () => {
	const t = convexTest(schema, modules);
	const orgA = t.withIdentity(identityForOrg('org_a'));
	const orgB = t.withIdentity(identityForOrg('org_b'));
	const event = await orgA.mutation(api.events.upsert, {
		name: 'Org A Conf',
		year: 2026
	});

	await expect(orgB.query(api.eventViews.getDetail, { eventId: event!._id })).resolves.toBeNull();
	await expect(orgB.query(api.eventViews.getList, {})).resolves.toEqual([]);
});
