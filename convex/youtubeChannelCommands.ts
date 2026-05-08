import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import { requireOrganizationId } from './authz';
import type { MutationCtx } from './_generated/server';

const youtubeChannelValidator = v.object({
	youtubeChannelId: v.string(),
	title: v.string(),
	handle: v.optional(v.string()),
	thumbnailUrl: v.optional(v.string()),
	uploadsPlaylistId: v.optional(v.string())
});

export const recordAuthorizedChannels = mutation({
	args: {
		channels: v.array(youtubeChannelValidator)
	},
	handler: async (ctx, { channels }) => {
		const organizationId = await requireOrganizationId(ctx);

		return await recordAuthorizedChannelsHandler(ctx, organizationId, channels);
	}
});

export const recordAuthorizedChannelsInternal = internalMutation({
	args: {
		organizationId: v.string(),
		channels: v.array(youtubeChannelValidator)
	},
	handler: async (ctx, { organizationId, channels }) => {
		return await recordAuthorizedChannelsHandler(ctx, organizationId, channels);
	}
});

async function recordAuthorizedChannelsHandler(
	ctx: MutationCtx,
	organizationId: string,
	channels: Array<{
		youtubeChannelId: string;
		title: string;
		handle?: string;
		thumbnailUrl?: string;
		uploadsPlaylistId?: string;
	}>
) {
	const recordedChannels = [];

	for (const channel of channels.slice(0, 50)) {
		const recordedChannel = await upsertYoutubeChannel(ctx, organizationId, channel);

		if (recordedChannel) {
			recordedChannels.push(recordedChannel);
		}
	}

	return recordedChannels;
}

export async function upsertYoutubeChannel(
	ctx: MutationCtx,
	organizationId: string,
	channel: {
		youtubeChannelId: string;
		title: string;
		handle?: string;
		thumbnailUrl?: string;
		uploadsPlaylistId?: string;
	}
) {
	const existing = await ctx.db
		.query('youtubeChannels')
		.withIndex('by_organizationId_and_youtubeChannelId', (q) =>
			q.eq('organizationId', organizationId).eq('youtubeChannelId', channel.youtubeChannelId)
		)
		.unique();
	const now = Date.now();
	const document = {
		organizationId,
		youtubeChannelId: channel.youtubeChannelId,
		title: channel.title,
		...(channel.handle !== undefined ? { handle: channel.handle } : {}),
		...(channel.thumbnailUrl !== undefined ? { thumbnailUrl: channel.thumbnailUrl } : {}),
		...(channel.uploadsPlaylistId !== undefined
			? { uploadsPlaylistId: channel.uploadsPlaylistId }
			: {}),
		lastSeenAt: now
	};

	if (existing) {
		await ctx.db.patch(existing._id, document);

		return await ctx.db.get(existing._id);
	}

	const id = await ctx.db.insert('youtubeChannels', {
		...document,
		connectedAt: now
	});

	return await ctx.db.get(id);
}
