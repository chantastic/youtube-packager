import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';
import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

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

		return await collectCaptionsByVideoId(ctx, video._id, organizationId);
	}
});

export const collectByVideoIdInternal = internalQuery({
	args: {
		videoId: v.id('videos')
	},
	handler: async (ctx, { videoId }) => {
		const video = await ctx.db.get(videoId);

		if (!video) {
			return [];
		}

		return await collectCaptionsByVideoId(ctx, video._id, video.organizationId);
	}
});

async function collectCaptionsByVideoId(
	ctx: QueryCtx,
	videoId: Id<'videos'>,
	organizationId: string
) {
	const captions = await ctx.db
		.query('videoCaptions')
		.withIndex('by_organizationId_and_videoId', (q) =>
			q.eq('organizationId', organizationId).eq('videoId', videoId)
		)
		.take(50);

	return captions.sort((a, b) => b.fetchedAt - a.fetchedAt);
}

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

		const existing = await ctx.db
			.query('videoCaptions')
			.withIndex('by_organizationId_and_videoId_and_captionTrackId', (q) =>
				q
					.eq('organizationId', video.organizationId)
					.eq('videoId', video._id)
					.eq('captionTrackId', caption.captionTrackId)
			)
			.unique();
		const document = {
			organizationId: video.organizationId,
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
