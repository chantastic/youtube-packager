import { v } from 'convex/values';
import { query } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';

export const find = query({
	args: {
		id: v.id('videos')
	},
	handler: async (ctx, { id }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await ctx.db.get(id);

		return documentBelongsToOrganization(video, organizationId) ? video : null;
	}
});

export const findByYoutubeVideoId = query({
	args: {
		youtubeVideoId: v.string()
	},
	handler: async (ctx, { youtubeVideoId }) => {
		const organizationId = await requireOrganizationId(ctx);

		return await ctx.db
			.query('videos')
			.withIndex('by_organizationId_and_youtubeVideoId', (q) =>
				q.eq('organizationId', organizationId).eq('youtubeVideoId', youtubeVideoId)
			)
			.unique();
	}
});
