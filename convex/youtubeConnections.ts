import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

const connectionFieldsValidator = {
	userId: v.string(),
	organizationId: v.optional(v.string()),
	refreshTokenCiphertext: v.string(),
	refreshTokenIv: v.string(),
	scopes: v.array(v.string()),
	tokenType: v.optional(v.string())
};

function organizationKey(organizationId?: string) {
	return organizationId ?? '';
}

export const findByUserIdAndOrganizationKeyInternal = internalQuery({
	args: {
		userId: v.string(),
		organizationId: v.optional(v.string())
	},
	handler: async (ctx, { userId, organizationId }) => {
		return await ctx.db
			.query('youtubeConnections')
			.withIndex('by_userId_and_organizationKey', (q) =>
				q.eq('userId', userId).eq('organizationKey', organizationKey(organizationId))
			)
			.unique();
	}
});

export const upsertInternal = internalMutation({
	args: connectionFieldsValidator,
	handler: async (ctx, args) => {
		const now = Date.now();
		const key = organizationKey(args.organizationId);
		const existing = await ctx.db
			.query('youtubeConnections')
			.withIndex('by_userId_and_organizationKey', (q) =>
				q.eq('userId', args.userId).eq('organizationKey', key)
			)
			.unique();
		const connection = {
			userId: args.userId,
			...(args.organizationId !== undefined ? { organizationId: args.organizationId } : {}),
			organizationKey: key,
			refreshTokenCiphertext: args.refreshTokenCiphertext,
			refreshTokenIv: args.refreshTokenIv,
			scopes: args.scopes,
			...(args.tokenType !== undefined ? { tokenType: args.tokenType } : {}),
			status: 'active' as const,
			connectedAt: existing?.connectedAt ?? now,
			updatedAt: now
		};

		if (existing) {
			await ctx.db.replace(existing._id, connection);
			return await ctx.db.get(existing._id);
		}

		const id = await ctx.db.insert('youtubeConnections', connection);

		return await ctx.db.get(id);
	}
});

export const upsertNeedsReauthorizationByUserIdAndOrganizationKeyInternal = internalMutation({
	args: {
		userId: v.string(),
		organizationId: v.optional(v.string()),
		lastError: v.optional(v.string())
	},
	handler: async (ctx, { userId, organizationId, lastError }) => {
		const connection = await ctx.db
			.query('youtubeConnections')
			.withIndex('by_userId_and_organizationKey', (q) =>
				q.eq('userId', userId).eq('organizationKey', organizationKey(organizationId))
			)
			.unique();

		if (connection) {
			await ctx.db.patch(connection._id, {
				status: 'needs_reauthorization',
				updatedAt: Date.now(),
				...(lastError !== undefined ? { lastError } : {})
			});
			return await ctx.db.get(connection._id);
		}

		return null;
	}
});

export const destroyByUserIdAndOrganizationKeyInternal = internalMutation({
	args: {
		userId: v.string(),
		organizationId: v.optional(v.string())
	},
	handler: async (ctx, { userId, organizationId }) => {
		const connection = await ctx.db
			.query('youtubeConnections')
			.withIndex('by_userId_and_organizationKey', (q) =>
				q.eq('userId', userId).eq('organizationKey', organizationKey(organizationId))
			)
			.unique();

		if (connection) {
			await ctx.db.delete(connection._id);
			return connection;
		}

		return null;
	}
});
