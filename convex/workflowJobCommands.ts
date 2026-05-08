import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

export const recordRunningInternal = internalMutation({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (ctx, { jobId }) => {
		const job = await getWorkflowJobOrThrow(ctx, jobId);
		const now = Date.now();

		await ctx.db.patch(job._id, {
			status: 'running',
			error: undefined,
			startedAt: job.startedAt ?? now,
			updatedAt: now
		});

		return await ctx.db.get(job._id);
	}
});

export const recordCompleteInternal = internalMutation({
	args: {
		jobId: v.id('workflowJobs'),
		result: v.optional(v.string())
	},
	handler: async (ctx, { jobId, result }) => {
		const job = await getWorkflowJobOrThrow(ctx, jobId);
		const now = Date.now();

		await ctx.db.patch(job._id, {
			status: 'complete',
			...(result !== undefined ? { result } : {}),
			error: undefined,
			completedAt: now,
			updatedAt: now
		});

		return await ctx.db.get(job._id);
	}
});

export const recordErrorInternal = internalMutation({
	args: {
		jobId: v.id('workflowJobs'),
		error: v.string()
	},
	handler: async (ctx, { jobId, error }) => {
		const job = await getWorkflowJobOrThrow(ctx, jobId);
		const now = Date.now();

		await ctx.db.patch(job._id, {
			status: 'error',
			error,
			completedAt: now,
			updatedAt: now
		});

		return await ctx.db.get(job._id);
	}
});

async function getWorkflowJobOrThrow(ctx: MutationCtx, jobId: Id<'workflowJobs'>) {
	const job = await ctx.db.get(jobId);

	if (!job) {
		throw new Error('Workflow job not found.');
	}

	return job;
}
