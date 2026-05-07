import { v } from 'convex/values';
import { query } from './_generated/server';

export const collectByVideoId = query({
	args: {
		videoId: v.id('videos')
	},
	handler: async (ctx, { videoId }) => {
		return await ctx.db
			.query('playlistAssignments')
			.withIndex('by_videoId', (q) => q.eq('videoId', videoId))
			.take(100);
	}
});
