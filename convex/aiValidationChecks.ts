import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import {
	aiValidationCacheKeyValidator,
	aiValidationCheckWriteValidator,
	type AiValidationCacheKey,
	type AiValidationCheckWrite
} from './aiValidationCheckTypes';
import { requireOrganizationId } from './authz';
import type { MutationCtx, QueryCtx } from './_generated/server';

export const collectByCacheKey = query({
	args: {
		keys: v.array(aiValidationCacheKeyValidator)
	},
	handler: async (ctx, { keys }) => {
		const organizationId = await requireOrganizationId(ctx);

		return await collectByCacheKeyHandler(
			ctx,
			keys.map((key) => ({ ...key, organizationId }))
		);
	}
});

export const collectByCacheKeyInternal = internalQuery({
	args: {
		keys: v.array(aiValidationCacheKeyValidator)
	},
	handler: async (ctx, { keys }) => {
		return await collectByCacheKeyHandler(ctx, keys);
	}
});

export const upsertMany = mutation({
	args: {
		checks: v.array(aiValidationCheckWriteValidator)
	},
	handler: async (ctx, { checks }) => {
		const organizationId = await requireOrganizationId(ctx);

		return await upsertManyHandler(
			ctx,
			checks.map((check) => ({ ...check, organizationId }))
		);
	}
});

export const upsertManyInternal = internalMutation({
	args: {
		checks: v.array(aiValidationCheckWriteValidator)
	},
	handler: async (ctx, { checks }) => {
		return await upsertManyHandler(ctx, checks);
	}
});

async function collectByCacheKeyHandler(ctx: QueryCtx, keys: AiValidationCacheKey[]) {
	const checks = [];

	for (const key of keys.slice(0, 500)) {
		if (!key.organizationId) {
			continue;
		}

		const check = await ctx.db
			.query('aiValidationChecks')
			.withIndex('by_organizationId_and_cache_key', (q) =>
				q
					.eq('organizationId', key.organizationId)
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

async function upsertManyHandler(ctx: MutationCtx, checks: AiValidationCheckWrite[]) {
	const writtenChecks = [];

	for (const check of checks.slice(0, 500)) {
		if (!check.organizationId) {
			continue;
		}

		const existing = await ctx.db
			.query('aiValidationChecks')
			.withIndex('by_organizationId_and_cache_key', (q) =>
				q
					.eq('organizationId', check.organizationId)
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
