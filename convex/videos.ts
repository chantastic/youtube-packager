import { v } from 'convex/values';
import { query } from './_generated/server';

export const find = query({
	args: {
		id: v.id('videos')
	},
	handler: async (ctx, { id }) => {
		return await ctx.db.get(id);
	}
});

export const findByYoutubeVideoId = query({
	args: {
		youtubeVideoId: v.string()
	},
	handler: async (ctx, { youtubeVideoId }) => {
		return await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.unique();
	}
});
