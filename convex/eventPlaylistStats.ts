import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireOrganizationId } from './authz';

export const collectByEventId = query({
	args: {
		eventIds: v.array(v.id('events'))
	},
	handler: async (ctx, { eventIds }) => {
		const organizationId = await requireOrganizationId(ctx);
		const stats = [];

		for (const eventId of eventIds.slice(0, 100)) {
			const eventStats =
				(await ctx.db
					.query('eventPlaylistStats')
					.withIndex('by_organizationId_and_eventId', (q) =>
						q.eq('organizationId', organizationId).eq('eventId', eventId)
					)
					.unique()) ??
				(await ctx.db
					.query('eventPlaylistStats')
					.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
					.unique());

			if (eventStats && eventStats.organizationId === undefined) {
				stats.push(eventStats);
			} else if (eventStats?.organizationId === organizationId) {
				stats.push(eventStats);
			}
		}

		return stats;
	}
});
