import { v } from 'convex/values';
import { query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

export const get = query({
	args: {
		id: v.id('videos')
	},
	handler: async (ctx, { id }) => {
		const video = await ctx.db.get(id);

		return video ? await buildVideoView(ctx, video) : null;
	}
});

export const getByRouteParam = query({
	args: {
		routeParam: v.string()
	},
	handler: async (ctx, { routeParam }) => {
		const id = ctx.db.normalizeId('videos', routeParam);

		if (id) {
			const video = await ctx.db.get(id);

			if (video) {
				return {
					kind: 'id' as const,
					videoView: await buildVideoView(ctx, video)
				};
			}
		}

		const video = await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', routeParam))
			.unique();

		if (!video) {
			return null;
		}

		return {
			kind: 'youtubeVideoId' as const,
			videoView: await buildVideoView(ctx, video)
		};
	}
});

async function buildVideoView(ctx: QueryCtx, video: Doc<'videos'>) {
	const assignments = await ctx.db
		.query('playlistAssignments')
		.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
		.take(100);
	const assignmentsWithEvents = [];
	const speakerAssignments = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
		.take(100);
	const speakers = [];

	for (const assignment of assignments) {
		const event = await ctx.db.get(assignment.eventId);

		if (event) {
			assignmentsWithEvents.push({ assignment, event });
		}
	}

	for (const speakerAssignment of speakerAssignments.sort((a, b) => a.position - b.position)) {
		const speaker = await ctx.db.get(speakerAssignment.speakerId);

		if (speaker) {
			speakers.push({ assignment: speakerAssignment, speaker });
		}
	}

	return {
		video,
		speakers,
		assignments: assignmentsWithEvents
	};
}
