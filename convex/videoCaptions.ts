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

export const collectByVideoIdInternal = internalQuery({
	args: {
		videoId: v.id('videos')
	},
	handler: async (ctx, { videoId }) => {
		const video = await ctx.db.get(videoId);

		if (!video) {
			return [];
		}

		const captions = video.organizationId
			? await ctx.db
					.query('videoCaptions')
					.withIndex('by_organizationId_and_videoId', (q) =>
						q.eq('organizationId', video.organizationId).eq('videoId', videoId)
					)
					.take(50)
			: await ctx.db
					.query('videoCaptions')
					.withIndex('by_videoId', (q) => q.eq('videoId', videoId))
					.take(50);

		return captions.sort((a, b) => b.fetchedAt - a.fetchedAt);
	}
});

export const upsertByVideoIdAndCaptionTrackIdInternal = internalMutation({
	args: {
		videoId: v.id('videos'),
		caption: v.object(captionValidator)
	},
	handler: async (ctx, { videoId, caption }) => {
		const video = await ctx.db.get(videoId);

		if (!video) {
			throw new Error('Video not found.');
		}

		const existing = video.organizationId
			? await ctx.db
					.query('videoCaptions')
					.withIndex('by_organizationId_and_videoId_and_captionTrackId', (q) =>
						q
							.eq('organizationId', video.organizationId)
							.eq('videoId', video._id)
							.eq('captionTrackId', caption.captionTrackId)
					)
					.unique()
			: await ctx.db
					.query('videoCaptions')
					.withIndex('by_videoId_and_captionTrackId', (q) =>
						q.eq('videoId', video._id).eq('captionTrackId', caption.captionTrackId)
					)
					.unique();
		const document = {
			...(video.organizationId !== undefined ? { organizationId: video.organizationId } : {}),
			videoId: video._id,
			youtubeVideoId: video.youtubeVideoId,
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
			return await ctx.db.get(existing._id);
		}

		const id = await ctx.db.insert('videoCaptions', document);

		return await ctx.db.get(id);
	}
});
