import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';
import {
	titleValidationCheckIdValidator,
	type TitleValidationCheckId
} from './titleValidationTypes';

const eventTypeValidator = v.union(v.literal('conference'), v.literal('interviews'));

function normalizeEnabledTitleValidationIds(enabledTitleValidationIds?: TitleValidationCheckId[]) {
	const dedupedIds = [...new Set(enabledTitleValidationIds ?? [])];

	return dedupedIds.length ? dedupedIds : undefined;
}

export const collect = query({
	args: {},
	handler: async (ctx) => {
		const organizationId = await requireOrganizationId(ctx);

		return await ctx.db
			.query('events')
			.withIndex('by_organizationId', (q) => q.eq('organizationId', organizationId))
			.order('asc')
			.take(100);
	}
});

export const find = query({
	args: { id: v.id('events') },
	handler: async (ctx, { id }) => {
		const organizationId = await requireOrganizationId(ctx);
		const event = await ctx.db.get(id);

		return documentBelongsToOrganization(event, organizationId) ? event : null;
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
		enabledTitleValidationIds: v.optional(v.array(titleValidationCheckIdValidator)),
		youtubePlaylistId: v.optional(v.string())
	},
	handler: async (ctx, { id, enabledTitleValidationIds, ...fields }) => {
		const organizationId = await requireOrganizationId(ctx);
		const normalizedEnabledTitleValidationIds =
			normalizeEnabledTitleValidationIds(enabledTitleValidationIds);
		const document = {
			...fields,
			organizationId,
			eventType: fields.eventType ?? 'conference',
			...(normalizedEnabledTitleValidationIds
				? { enabledTitleValidationIds: normalizedEnabledTitleValidationIds }
				: {})
		};

		if (id) {
			const existing = await ctx.db.get(id);

			if (!documentBelongsToOrganization(existing, organizationId)) {
				throw new Error('Event not found.');
			}

			await ctx.db.patch(id, {
				...document,
				...(normalizedEnabledTitleValidationIds ? {} : { enabledTitleValidationIds: undefined })
			});
			return await ctx.db.get(id);
		}

		const newId = await ctx.db.insert('events', document);

		return await ctx.db.get(newId);
	}
});

export const destroy = mutation({
	args: { id: v.id('events') },
	handler: async (ctx, { id }) => {
		const organizationId = await requireOrganizationId(ctx);
		const event = await ctx.db.get(id);

		if (!documentBelongsToOrganization(event, organizationId)) {
			return null;
		}

		await ctx.db.delete(id);

		return event;
	}
});
