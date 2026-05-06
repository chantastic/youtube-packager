import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

const captionValidator = {
	captionTrackId: v.string(),
	language: v.optional(v.string()),
	name: v.optional(v.string()),
	trackKind: v.optional(v.string()),
	isAutoSynced: v.optional(v.boolean()),
	status: v.optional(v.string()),
	format: v.literal('srt'),
	body: v.string()
};

export const listByYoutubeVideoId = internalQuery({
	args: {
		youtubeVideoId: v.string()
	},
	handler: async (ctx, { youtubeVideoId }) => {
		const captions = await ctx.db
			.query('videoCaptions')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.take(50);

		return captions.sort((a, b) => b.fetchedAt - a.fetchedAt);
	}
});

export const upsertForYoutubeVideoId = internalMutation({
	args: {
		youtubeVideoId: v.string(),
		caption: v.object(captionValidator)
	},
	handler: async (ctx, { youtubeVideoId, caption }) => {
		const video = await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.unique();

		if (!video) {
			throw new Error('Video not found.');
		}

		const existing = await ctx.db
			.query('videoCaptions')
			.withIndex('by_youtubeVideoId_and_captionTrackId', (q) =>
				q.eq('youtubeVideoId', youtubeVideoId).eq('captionTrackId', caption.captionTrackId)
			)
			.unique();
		const document = {
			videoId: video._id,
			youtubeVideoId,
			captionTrackId: caption.captionTrackId,
			...(caption.language !== undefined ? { language: caption.language } : {}),
			...(caption.name !== undefined ? { name: caption.name } : {}),
			...(caption.trackKind !== undefined ? { trackKind: caption.trackKind } : {}),
			...(caption.isAutoSynced !== undefined ? { isAutoSynced: caption.isAutoSynced } : {}),
			...(caption.status !== undefined ? { status: caption.status } : {}),
			format: caption.format,
			body: caption.body,
			fetchedAt: Date.now()
		};

		if (existing) {
			await ctx.db.replace(existing._id, document);
			return existing._id;
		}

		return await ctx.db.insert('videoCaptions', document);
	}
});
