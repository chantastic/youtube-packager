import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const eventTypeValidator = v.union(v.literal('conference'), v.literal('interviews'));

export const collect = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query('events').order('asc').take(100);
	}
});

export const find = query({
	args: { id: v.id('events') },
	handler: async (ctx, { id }) => {
		return await ctx.db.get(id);
	}
});

export const upsert = mutation({
	args: {
		id: v.optional(v.id('events')),
		name: v.string(),
		editionTitle: v.optional(v.string()),
		eventType: v.optional(eventTypeValidator),
		year: v.number(),
		titleFormat: v.optional(v.string()),
		youtubePlaylistId: v.optional(v.string())
	},
	handler: async (ctx, { id, ...fields }) => {
		const document = {
			...fields,
			eventType: fields.eventType ?? 'conference'
		};

		if (id) {
			await ctx.db.patch(id, document);
			return await ctx.db.get(id);
		}

		const newId = await ctx.db.insert('events', document);

		return await ctx.db.get(newId);
	}
});

export const destroy = mutation({
	args: { id: v.id('events') },
	handler: async (ctx, { id }) => {
		const event = await ctx.db.get(id);

		if (!event) {
			return null;
		}

		await ctx.db.delete(id);

		return event;
	}
});
