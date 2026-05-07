import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const validationStatusValidator = v.union(
	v.literal('pass'),
	v.literal('fail'),
	v.literal('info'),
	v.literal('pending')
);

const validationValidator = v.object({
	id: v.string(),
	label: v.string(),
	status: validationStatusValidator,
	message: v.string(),
	expected: v.optional(v.string()),
	details: v.optional(v.array(v.string())),
	suggested: v.optional(v.string())
});

const cacheKeyValidator = v.object({
	videoId: v.string(),
	field: v.string(),
	checkId: v.string(),
	inputHash: v.string(),
	model: v.string(),
	promptVersion: v.string(),
	modelConfigHash: v.string()
});

export const collectByCacheKey = query({
	args: {
		keys: v.array(cacheKeyValidator)
	},
	handler: async (ctx, { keys }) => {
		const checks = [];

		for (const key of keys.slice(0, 500)) {
			const check = await ctx.db
				.query('aiValidationChecks')
				.withIndex('by_cache_key', (q) =>
					q
						.eq('videoId', key.videoId)
						.eq('field', key.field)
						.eq('checkId', key.checkId)
						.eq('inputHash', key.inputHash)
						.eq('model', key.model)
						.eq('promptVersion', key.promptVersion)
						.eq('modelConfigHash', key.modelConfigHash)
				)
				.unique();

			if (check) {
				checks.push(check);
			}
		}

		return checks;
	}
});

export const upsertMany = mutation({
	args: {
		checks: v.array(
			v.object({
				videoId: v.string(),
				field: v.string(),
				checkId: v.string(),
				inputHash: v.string(),
				inputSnapshot: v.string(),
				model: v.string(),
				promptVersion: v.string(),
				modelConfigHash: v.string(),
				validation: validationValidator,
				checkedAt: v.number()
			})
		)
	},
	handler: async (ctx, { checks }) => {
		const writtenChecks = [];

		for (const check of checks.slice(0, 500)) {
			const existing = await ctx.db
				.query('aiValidationChecks')
				.withIndex('by_cache_key', (q) =>
					q
						.eq('videoId', check.videoId)
						.eq('field', check.field)
						.eq('checkId', check.checkId)
						.eq('inputHash', check.inputHash)
						.eq('model', check.model)
						.eq('promptVersion', check.promptVersion)
						.eq('modelConfigHash', check.modelConfigHash)
				)
				.unique();

			if (existing) {
				await ctx.db.patch(existing._id, check);
				const writtenCheck = await ctx.db.get(existing._id);

				if (writtenCheck) {
					writtenChecks.push(writtenCheck);
				}
			} else {
				const id = await ctx.db.insert('aiValidationChecks', check);
				const writtenCheck = await ctx.db.get(id);

				if (writtenCheck) {
					writtenChecks.push(writtenCheck);
				}
			}
		}

		return writtenChecks;
	}
});
