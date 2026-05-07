import { v } from 'convex/values';
import { query } from './_generated/server';

export const getByYoutubeVideoId = query({
	args: {
		youtubeVideoId: v.string()
	},
	handler: async (ctx, { youtubeVideoId }) => {
		const video = await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.unique();

		if (!video) {
			return null;
		}

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
});
