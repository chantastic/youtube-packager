import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const list = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query('events').order('asc').take(100);
	}
});

export const get = query({
	args: { id: v.id('events') },
	handler: async (ctx, { id }) => {
		return await ctx.db.get(id);
	}
});

export const create = mutation({
	args: {
		name: v.string(),
		editionTitle: v.optional(v.string()),
		year: v.number(),
		titleFormat: v.optional(v.string()),
		youtubePlaylistId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert('events', args);
	}
});

export const update = mutation({
	args: {
		id: v.id('events'),
		name: v.string(),
		editionTitle: v.optional(v.string()),
		year: v.number(),
		titleFormat: v.optional(v.string()),
		youtubePlaylistId: v.optional(v.string())
	},
	handler: async (ctx, { id, ...fields }) => {
		await ctx.db.patch(id, fields);
	}
});

export const remove = mutation({
	args: { id: v.id('events') },
	handler: async (ctx, { id }) => {
		await ctx.db.delete(id);
	}
});
