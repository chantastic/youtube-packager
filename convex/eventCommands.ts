import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';
import { titleValidationCheckIdValidator } from './titleValidationTypes';

export const setTitleValidations = mutation({
	args: {
		eventId: v.id('events'),
		enabledTitleValidationIds: v.array(titleValidationCheckIdValidator)
	},
	handler: async (ctx, { eventId, enabledTitleValidationIds }) => {
		const organizationId = await requireOrganizationId(ctx);
		const event = await ctx.db.get(eventId);

		if (!documentBelongsToOrganization(event, organizationId)) {
			throw new Error('Event not found.');
		}

		const dedupedIds = [...new Set(enabledTitleValidationIds)];

		await ctx.db.patch(event._id, {
			organizationId,
			enabledTitleValidationIds: dedupedIds.length ? dedupedIds : undefined
		});

		return await ctx.db.get(event._id);
	}
});
