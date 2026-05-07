import { mutation } from './_generated/server';
import { requireOrganizationId } from './authz';

export const claimLegacyDataForCurrentOrganization = mutation({
	args: {},
	handler: async (ctx) => {
		const organizationId = await requireOrganizationId(ctx);
		const now = Date.now();
		const existingOrganization = await ctx.db
			.query('organizations')
			.withIndex('by_workosOrganizationId', (q) => q.eq('workosOrganizationId', organizationId))
			.unique();

		if (existingOrganization) {
			await ctx.db.patch(existingOrganization._id, { updatedAt: now });
		} else {
			await ctx.db.insert('organizations', {
				workosOrganizationId: organizationId,
				createdAt: now,
				updatedAt: now
			});
		}

		const events = await ctx.db
			.query('events')
			.withIndex('by_organizationId', (q) => q.eq('organizationId', undefined))
			.take(1000);
		const videos = await ctx.db
			.query('videos')
			.withIndex('by_organizationId_and_youtubeVideoId', (q) => q.eq('organizationId', undefined))
			.take(1000);
		const speakers = await ctx.db
			.query('speakers')
			.withIndex('by_organizationId_and_name_and_company', (q) => q.eq('organizationId', undefined))
			.take(1000);
		const videoSpeakers = await ctx.db
			.query('videoSpeakers')
			.withIndex('by_organizationId_and_videoId', (q) => q.eq('organizationId', undefined))
			.take(1000);
		const captions = await ctx.db
			.query('videoCaptions')
			.withIndex('by_organizationId_and_videoId', (q) => q.eq('organizationId', undefined))
			.take(1000);
		const playlistAssignments = await ctx.db
			.query('playlistAssignments')
			.withIndex('by_organizationId_and_eventId', (q) => q.eq('organizationId', undefined))
			.take(1000);
		const playlistStats = await ctx.db
			.query('eventPlaylistStats')
			.withIndex('by_organizationId_and_eventId', (q) => q.eq('organizationId', undefined))
			.take(1000);
		const validationChecks = await ctx.db
			.query('aiValidationChecks')
			.withIndex('by_organizationId_and_cache_key', (q) => q.eq('organizationId', undefined))
			.take(1000);
		const aiJobs = await ctx.db
			.query('aiJobs')
			.withIndex('by_organizationId_and_task_and_videoId_and_queuedAt', (q) =>
				q.eq('organizationId', undefined)
			)
			.take(1000);

		for (const event of events) {
			await ctx.db.patch(event._id, { organizationId });
		}

		for (const video of videos) {
			await ctx.db.patch(video._id, { organizationId });
		}

		for (const speaker of speakers) {
			await ctx.db.patch(speaker._id, { organizationId });
		}

		for (const videoSpeaker of videoSpeakers) {
			await ctx.db.patch(videoSpeaker._id, { organizationId });
		}

		for (const caption of captions) {
			await ctx.db.patch(caption._id, { organizationId });
		}

		for (const assignment of playlistAssignments) {
			await ctx.db.patch(assignment._id, { organizationId });
		}

		for (const stats of playlistStats) {
			await ctx.db.patch(stats._id, { organizationId });
		}

		for (const validationCheck of validationChecks) {
			await ctx.db.patch(validationCheck._id, { organizationId });
		}

		for (const job of aiJobs) {
			await ctx.db.patch(job._id, { organizationId });
		}

		return {
			organizationId,
			claimed: {
				events: events.length,
				videos: videos.length,
				speakers: speakers.length,
				videoSpeakers: videoSpeakers.length,
				captions: captions.length,
				playlistAssignments: playlistAssignments.length,
				playlistStats: playlistStats.length,
				validationChecks: validationChecks.length,
				aiJobs: aiJobs.length
			}
		};
	}
});
