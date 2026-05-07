import { v } from 'convex/values';
import { query } from './_generated/server';

export const collectByEventId = query({
	args: {
		eventIds: v.array(v.id('events'))
	},
	handler: async (ctx, { eventIds }) => {
		const stats = [];

		for (const eventId of eventIds.slice(0, 100)) {
			const eventStats = await ctx.db
				.query('eventPlaylistStats')
				.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
				.unique();

			if (eventStats) {
				stats.push(eventStats);
			}
		}

		return stats;
	}
});
