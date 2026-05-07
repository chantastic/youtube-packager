import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { descriptionGenerationTask } from './aiJobTypes';
import { generatedDescriptionValidator } from './descriptionGenerationTypes';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

export const requestDescriptionGeneration = mutation({
	args: {
		videoId: v.id('videos')
	},
	handler: async (ctx, { videoId }) => {
		const video = await ctx.db.get(videoId);

		if (!video) {
			throw new Error('Video not found.');
		}

		const inFlightJob = await findInFlightDescriptionJob(ctx, video._id);

		if (inFlightJob) {
			return {
				job: inFlightJob,
				error: null
			};
		}

		const caption = await findLatestCaption(ctx, video._id);

		if (!caption) {
			return {
				job: null,
				error: 'Fetch captions before generating a structured description.'
			};
		}

		const now = Date.now();
		const jobId = await ctx.db.insert('aiJobs', {
			task: descriptionGenerationTask,
			status: 'queued',
			videoId: video._id,
			captionId: caption._id,
			queuedAt: now,
			updatedAt: now
		});
		const job = await ctx.db.get(jobId);

		await ctx.scheduler.runAfter(0, internal.videoWorkflows.generateDescriptionForJob, {
			jobId
		});

		return {
			job,
			error: null
		};
	}
});

export const recordDescriptionGenerationRunningInternal = internalMutation({
	args: {
		jobId: v.id('aiJobs')
	},
	handler: async (ctx, { jobId }) => {
		const job = await getDescriptionGenerationJobOrThrow(ctx, jobId);
		const now = Date.now();

		await ctx.db.patch(job._id, {
			status: 'running',
			error: undefined,
			startedAt: now,
			updatedAt: now
		});

		return await ctx.db.get(job._id);
	}
});

export const recordDescriptionGenerationCompleteInternal = internalMutation({
	args: {
		jobId: v.id('aiJobs'),
		result: generatedDescriptionValidator
	},
	handler: async (ctx, { jobId, result }) => {
		const job = await getDescriptionGenerationJobOrThrow(ctx, jobId);
		const now = Date.now();

		await ctx.db.patch(job._id, {
			status: 'complete',
			result,
			error: undefined,
			completedAt: now,
			updatedAt: now
		});

		return await ctx.db.get(job._id);
	}
});

export const recordDescriptionGenerationErrorInternal = internalMutation({
	args: {
		jobId: v.id('aiJobs'),
		error: v.string()
	},
	handler: async (ctx, { jobId, error }) => {
		const job = await getDescriptionGenerationJobOrThrow(ctx, jobId);
		const now = Date.now();

		await ctx.db.patch(job._id, {
			status: 'error',
			error,
			updatedAt: now,
			completedAt: now
		});

		return await ctx.db.get(job._id);
	}
});

async function findInFlightDescriptionJob(ctx: MutationCtx, videoId: Id<'videos'>) {
	const jobs = await ctx.db
		.query('aiJobs')
		.withIndex('by_task_and_videoId_and_queuedAt', (q) =>
			q.eq('task', descriptionGenerationTask).eq('videoId', videoId)
		)
		.order('desc')
		.take(10);

	return jobs.find((job) => job.status === 'queued' || job.status === 'running') ?? null;
}

async function findLatestCaption(ctx: MutationCtx, videoId: Id<'videos'>) {
	const captions = await ctx.db
		.query('videoCaptions')
		.withIndex('by_videoId', (q) => q.eq('videoId', videoId))
		.take(50);

	return captions.sort((a, b) => b.fetchedAt - a.fetchedAt)[0] ?? null;
}

async function getDescriptionGenerationJobOrThrow(ctx: MutationCtx, jobId: Id<'aiJobs'>) {
	const job = await ctx.db.get(jobId);

	if (!isDescriptionGenerationJob(job)) {
		throw new Error('Description generation job not found.');
	}

	return job;
}

function isDescriptionGenerationJob(
	job: Doc<'aiJobs'> | null
): job is Doc<'aiJobs'> & { task: 'descriptionGeneration' } {
	return Boolean(job && job.task === descriptionGenerationTask);
}
