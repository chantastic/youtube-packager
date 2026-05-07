import { v } from 'convex/values';
import { query } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';

export const collectByVideoId = query({
	args: {
		videoId: v.id('videos')
	},
	handler: async (ctx, { videoId }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await ctx.db.get(videoId);

		if (!documentBelongsToOrganization(video, organizationId)) {
			return [];
		}

		return await ctx.db
			.query('playlistAssignments')
			.withIndex('by_organizationId_and_videoId', (q) =>
				q.eq('organizationId', organizationId).eq('videoId', videoId)
			)
			.take(100);
	}
});
