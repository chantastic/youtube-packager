/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function identityForOrg(organizationId: string, userId = `user_${organizationId}`) {
	return {
		subject: userId,
		tokenIdentifier: userId,
		issuer: 'https://api.workos.com',
		user_id: userId,
		org_id: organizationId
	};
}

function identityWithoutOrg() {
	return {
		subject: 'user_without_org',
		tokenIdentifier: 'user_without_org',
		issuer: 'https://api.workos.com',
		user_id: 'user_without_org'
	};
}

function playlistVideo() {
	return {
		playlistItemId: 'playlist-item-1',
		youtubeVideoId: 'video-1',
		title: 'Org A video',
		position: 0,
		videoUrl: 'https://www.youtube.com/watch?v=video-1',
		playlistVideoUrl: 'https://www.youtube.com/watch?v=video-1&list=PL_ORG_A',
		studioEditUrl: 'https://studio.youtube.com/video/video-1/edit'
	};
}

async function seedOrgScopedVideo(t: ReturnType<typeof convexTest>) {
	const orgA = t.withIdentity(identityForOrg('org_a'));
	const event = await orgA.mutation(api.events.upsert, {
		name: 'Org A Conf',
		year: 2026,
		youtubePlaylistId: 'PL_ORG_A'
	});

	await orgA.mutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
		organizationId: 'org_a',
		eventId: event!._id,
		playlist: {
			playlistId: 'PL_ORG_A',
			validationContextKey: 'org-a-conf-2026',
			validationStats: [
				{
					id: 'event',
					label: 'Event',
					passCount: 1,
					failCount: 0,
					infoCount: 0
				}
			],
			videos: [playlistVideo()]
		}
	});

	const video = await orgA.query(api.videos.findByYoutubeVideoId, {
		youtubeVideoId: 'video-1'
	});
	const caption = await orgA.mutation(
		internal.videoCaptions.upsertByVideoIdAndCaptionTrackIdInternal,
		{
			videoId: video!._id,
			caption: {
				captionTrackId: 'caption-1',
				language: 'en',
				format: 'srt',
				body: '1\n00:00:00,000 --> 00:00:02,000\nHello from org A.'
			}
		}
	);

	await orgA.mutation(api.videoCommands.assignSpeaker, {
		videoId: video!._id,
		name: 'Org A Speaker',
		company: 'Org A Company'
	});
	await t.run(async (ctx) => {
		const now = Date.now();

		await ctx.db.insert('workflowJobs', {
			organizationId: 'org_a',
			requestedByUserId: 'user_org_a',
			task: 'youtubeCaptionFetch',
			status: 'complete',
			key: `video:${video!._id}`,
			entityType: 'video',
			videoId: video!._id,
			result: JSON.stringify({ captionTrackId: 'caption-1' }),
			queuedAt: now,
			startedAt: now,
			completedAt: now,
			updatedAt: now
		});
		await ctx.db.insert('aiJobs', {
			organizationId: 'org_a',
			task: 'descriptionGeneration',
			status: 'complete',
			videoId: video!._id,
			captionId: caption!._id,
			queuedAt: now,
			startedAt: now,
			completedAt: now,
			updatedAt: now
		});
	});

	return { event: event!, video: video! };
}

test('app data functions require an authenticated organization context', async () => {
	const anonymous = convexTest(schema, modules);
	const noOrg = convexTest(schema, modules).withIdentity(identityWithoutOrg());

	await expect(anonymous.query(api.events.collect, {})).rejects.toThrow('Authentication required.');
	await expect(
		anonymous.mutation(api.events.upsert, {
			name: 'Anonymous Conf',
			year: 2026
		})
	).rejects.toThrow('Authentication required.');
	await expect(
		noOrg.mutation(api.events.upsert, {
			name: 'No Org Conf',
			year: 2026
		})
	).rejects.toThrow('Organization context required.');
	await expect(
		noOrg.action(api.videoWorkflows.collectCachedTitleAiChecks, {
			inputs: []
		})
	).rejects.toThrow('Organization context required.');
});

test("org-scoped views do not expose another organization's event or video graph", async () => {
	const t = convexTest(schema, modules);
	const { event, video } = await seedOrgScopedVideo(t);
	const orgB = t.withIdentity(identityForOrg('org_b'));

	await expect(orgB.query(api.events.collect, {})).resolves.toEqual([]);
	await expect(orgB.query(api.events.find, { id: event._id })).resolves.toBeNull();
	await expect(orgB.query(api.videos.find, { id: video._id })).resolves.toBeNull();
	await expect(
		orgB.query(api.videos.findByYoutubeVideoId, {
			youtubeVideoId: video.youtubeVideoId
		})
	).resolves.toBeNull();
	await expect(orgB.query(api.videoViews.get, { id: video._id })).resolves.toBeNull();
	await expect(
		orgB.query(api.videoViews.getByRouteParam, {
			routeParam: video.youtubeVideoId
		})
	).resolves.toBeNull();
	await expect(
		orgB.query(api.playlistAssignmentViews.getForEvent, {
			eventId: event._id
		})
	).resolves.toEqual([]);
	await expect(
		orgB.query(api.playlistAssignments.collectByVideoId, {
			videoId: video._id
		})
	).resolves.toEqual([]);
	await expect(
		orgB.query(api.videoCaptions.collectByVideoId, {
			videoId: video._id
		})
	).resolves.toEqual([]);
	await expect(
		orgB.query(api.eventPlaylistStats.collectByEventId, {
			eventIds: [event._id]
		})
	).resolves.toEqual([]);
	await expect(
		orgB.query(api.workflowJobViews.getLatestForVideoTask, {
			videoId: video._id,
			task: 'youtubeCaptionFetch'
		})
	).resolves.toBeNull();
	await expect(
		orgB.query(api.aiJobViews.getLatestDescriptionGenerationForVideo, {
			videoId: video._id
		})
	).resolves.toBeNull();
	await expect(orgB.query(api.speakers.collect, {})).resolves.toEqual([]);
});

test("org-scoped commands cannot mutate another organization's records", async () => {
	const t = convexTest(schema, modules);
	const { event, video } = await seedOrgScopedVideo(t);
	const orgA = t.withIdentity(identityForOrg('org_a'));
	const orgB = t.withIdentity(identityForOrg('org_b'));

	await expect(
		orgB.mutation(api.events.upsert, {
			id: event._id,
			name: 'Renamed By Org B',
			year: 2026
		})
	).rejects.toThrow('Event not found.');
	await expect(
		orgB.mutation(api.videoCommands.setMetadata, {
			videoId: video._id,
			videoType: 'keynote'
		})
	).rejects.toThrow('Video not found.');
	await expect(
		orgB.mutation(api.videoCommands.setDisabledTitleValidations, {
			videoId: video._id,
			disabledTitleValidationIds: ['hook']
		})
	).rejects.toThrow('Video not found.');
	await expect(
		orgB.mutation(api.videoCommands.assignSpeaker, {
			videoId: video._id,
			name: 'Org B Speaker'
		})
	).rejects.toThrow('Video not found.');
	await expect(
		orgB.mutation(api.youtubeCommands.requestCaptionFetch, {
			videoId: video._id
		})
	).rejects.toThrow('Video not found.');
	await expect(
		orgB.mutation(api.aiJobCommands.requestDescriptionGeneration, {
			videoId: video._id
		})
	).rejects.toThrow('Video not found.');
	await expect(orgB.mutation(api.events.destroy, { id: event._id })).resolves.toBeNull();

	await expect(orgA.query(api.events.find, { id: event._id })).resolves.toMatchObject({
		name: 'Org A Conf'
	});
	await expect(orgA.query(api.videos.find, { id: video._id })).resolves.toMatchObject({
		title: 'Org A video',
		videoType: 'talk'
	});
});
