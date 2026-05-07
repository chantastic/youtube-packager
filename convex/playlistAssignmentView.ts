import { v } from 'convex/values';
import { query } from './_generated/server';

export const getForEvent = query({
	args: {
		eventId: v.id('events')
	},
	handler: async (ctx, { eventId }) => {
		const assignments = await ctx.db
			.query('playlistAssignments')
			.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
			.take(500);
		const rows = [];

		for (const assignment of assignments.sort((a, b) => a.position - b.position)) {
			const video = await ctx.db.get(assignment.videoId);

			if (video) {
				const speakerAssignments = await ctx.db
					.query('videoSpeakers')
					.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
					.take(100);
				const speakers = [];

				for (const speakerAssignment of speakerAssignments.sort(
					(a, b) => a.position - b.position
				)) {
					const speaker = await ctx.db.get(speakerAssignment.speakerId);

					if (speaker) {
						speakers.push({ assignment: speakerAssignment, speaker });
					}
				}

				rows.push({ assignment, video, speakers });
			}
		}

		return rows;
	}
});
