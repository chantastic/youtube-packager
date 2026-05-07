import { v } from 'convex/values';
import { query } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

export const get = query({
	args: {
		id: v.id('videos')
	},
	handler: async (ctx, { id }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await ctx.db.get(id);

		return documentBelongsToOrganization(video, organizationId)
			? await buildVideoView(ctx, video, organizationId)
			: null;
	}
});

export const getByRouteParam = query({
	args: {
		routeParam: v.string()
	},
	handler: async (ctx, { routeParam }) => {
		const organizationId = await requireOrganizationId(ctx);
		const id = ctx.db.normalizeId('videos', routeParam);

		if (id) {
			const video = await ctx.db.get(id);

			if (documentBelongsToOrganization(video, organizationId)) {
				return {
					kind: 'id' as const,
					videoView: await buildVideoView(ctx, video, organizationId)
				};
			}
		}

		const video = await findVideoByYoutubeVideoId(ctx, routeParam, organizationId);

		if (!video) {
			return null;
		}

		return {
			kind: 'youtubeVideoId' as const,
			videoView: await buildVideoView(ctx, video, organizationId)
		};
	}
});

async function findVideoByYoutubeVideoId(
	ctx: QueryCtx,
	youtubeVideoId: string,
	organizationId: string
) {
	const scopedVideo = await ctx.db
		.query('videos')
		.withIndex('by_organizationId_and_youtubeVideoId', (q) =>
			q.eq('organizationId', organizationId).eq('youtubeVideoId', youtubeVideoId)
		)
		.unique();

	if (scopedVideo) {
		return scopedVideo;
	}

	const legacyVideos = await ctx.db
		.query('videos')
		.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
		.take(10);

	return legacyVideos.find((video) => video.organizationId === undefined) ?? null;
}

async function buildVideoView(ctx: QueryCtx, video: Doc<'videos'>, organizationId: string) {
	const scopedAssignments = await ctx.db
		.query('playlistAssignments')
		.withIndex('by_organizationId_and_videoId', (q) =>
			q.eq('organizationId', organizationId).eq('videoId', video._id)
		)
		.take(100);
	const legacyAssignments = await ctx.db
		.query('playlistAssignments')
		.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
		.take(100);
	const assignments = [
		...legacyAssignments.filter((assignment) => assignment.organizationId === undefined),
		...scopedAssignments
	];
	const assignmentsWithEvents: Array<{
		assignment: Doc<'playlistAssignments'>;
		event: Doc<'events'>;
	}> = [];
	const scopedSpeakerAssignments = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_organizationId_and_videoId', (q) =>
			q.eq('organizationId', organizationId).eq('videoId', video._id)
		)
		.take(100);
	const legacySpeakerAssignments = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
		.take(100);
	const speakerAssignments = [
		...legacySpeakerAssignments.filter((assignment) => assignment.organizationId === undefined),
		...scopedSpeakerAssignments
	];
	const speakers: Array<{
		assignment: Doc<'videoSpeakers'>;
		speaker: Doc<'speakers'>;
	}> = [];

	for (const assignment of assignments) {
		const event = await ctx.db.get(assignment.eventId);

		if (documentBelongsToOrganization(event, organizationId)) {
			assignmentsWithEvents.push({ assignment, event });
		}
	}

	for (const speakerAssignment of speakerAssignments.sort((a, b) => a.position - b.position)) {
		const speaker = await ctx.db.get(speakerAssignment.speakerId);

		if (documentBelongsToOrganization(speaker, organizationId)) {
			speakers.push({ assignment: speakerAssignment, speaker });
		}
	}

	return {
		video,
		speakers,
		assignments: assignmentsWithEvents
	};
}
