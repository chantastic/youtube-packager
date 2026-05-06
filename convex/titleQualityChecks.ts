import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const validationStatusValidator = v.union(v.literal('pass'), v.literal('fail'), v.literal('info'));

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
	titleHash: v.string(),
	model: v.string(),
	validationVersion: v.string()
});

export const getMany = query({
	args: {
		keys: v.array(cacheKeyValidator)
	},
	handler: async (ctx, { keys }) => {
		const checks = [];

		for (const key of keys.slice(0, 100)) {
			const check = await ctx.db
				.query('titleQualityChecks')
				.withIndex('by_videoId_and_titleHash_and_model_and_validationVersion', (q) =>
					q
						.eq('videoId', key.videoId)
						.eq('titleHash', key.titleHash)
						.eq('model', key.model)
						.eq('validationVersion', key.validationVersion)
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
				titleHash: v.string(),
				title: v.string(),
				model: v.string(),
				validationVersion: v.string(),
				validations: v.array(validationValidator),
				checkedAt: v.number()
			})
		)
	},
	handler: async (ctx, { checks }) => {
		for (const check of checks.slice(0, 100)) {
			const existing = await ctx.db
				.query('titleQualityChecks')
				.withIndex('by_videoId_and_titleHash_and_model_and_validationVersion', (q) =>
					q
						.eq('videoId', check.videoId)
						.eq('titleHash', check.titleHash)
						.eq('model', check.model)
						.eq('validationVersion', check.validationVersion)
				)
				.unique();

			if (existing) {
				await ctx.db.patch(existing._id, check);
			} else {
				await ctx.db.insert('titleQualityChecks', check);
			}
		}
	}
});
