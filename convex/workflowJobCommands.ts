import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

const terminalHistoryLimit = 10;
const retentionScanLimit = 200;

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

		const updatedJob = await getWorkflowJobOrThrow(ctx, job._id);
		await enforceWorkflowJobRetention(ctx, updatedJob);

		return updatedJob;
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

		const updatedJob = await getWorkflowJobOrThrow(ctx, job._id);
		await enforceWorkflowJobRetention(ctx, updatedJob);

		return updatedJob;
	}
});

async function getWorkflowJobOrThrow(ctx: MutationCtx, jobId: Id<'workflowJobs'>) {
	const job = await ctx.db.get(jobId);

	if (!job) {
		throw new Error('Workflow job not found.');
	}

	return job;
}

async function enforceWorkflowJobRetention(ctx: MutationCtx, job: Doc<'workflowJobs'>) {
	const jobs = await collectRetentionStreamJobs(ctx, job);
	let terminalCount = 0;

	for (const candidate of jobs) {
		if (!workflowJobIsTerminal(candidate)) {
			continue;
		}

		terminalCount += 1;

		if (terminalCount > terminalHistoryLimit) {
			await ctx.db.delete(candidate._id);
		}
	}
}

async function collectRetentionStreamJobs(ctx: MutationCtx, job: Doc<'workflowJobs'>) {
	if (job.videoId) {
		return await ctx.db
			.query('workflowJobs')
			.withIndex('by_organizationId_and_videoId_and_task_and_queuedAt', (q) =>
				q.eq('organizationId', job.organizationId).eq('videoId', job.videoId).eq('task', job.task)
			)
			.order('desc')
			.take(retentionScanLimit);
	}

	if (job.eventId) {
		return await ctx.db
			.query('workflowJobs')
			.withIndex('by_organizationId_and_eventId_and_task_and_queuedAt', (q) =>
				q.eq('organizationId', job.organizationId).eq('eventId', job.eventId).eq('task', job.task)
			)
			.order('desc')
			.take(retentionScanLimit);
	}

	return await ctx.db
		.query('workflowJobs')
		.withIndex('by_organizationId_and_task_and_key_and_queuedAt', (q) =>
			q.eq('organizationId', job.organizationId).eq('task', job.task).eq('key', job.key)
		)
		.order('desc')
		.take(retentionScanLimit);
}

function workflowJobIsTerminal(job: Doc<'workflowJobs'>) {
	return job.status === 'complete' || job.status === 'error';
}
