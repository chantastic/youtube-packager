import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import {
	youtubeCaptionFetchTask,
	youtubeChannelSyncTask,
	youtubePlaylistSyncTask,
	youtubeTitleUpdateTask,
	youtubeVideoRefreshTask
} from './workflowJobTypes';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import type { WorkflowJobTask } from './workflowJobTypes';

export const getPlaylistSyncContextInternal = internalQuery({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (ctx, { jobId }) => {
		const job = await ctx.db.get(jobId);

		if (!isWorkflowJob(job, youtubePlaylistSyncTask)) {
			return { job: null, event: null, error: 'Playlist sync job not found.' };
		}

		if (!job.eventId) {
			return { job, event: null, error: 'Playlist sync job is missing an event.' };
		}

		const event = await ctx.db.get(job.eventId);

		if (!event || event.organizationId !== job.organizationId) {
			return { job, event: null, error: 'Event not found.' };
		}

		if (!event.youtubePlaylistId) {
			return { job, event, error: 'Link a playlist before syncing videos.' };
		}

		return { job, event, error: null };
	}
});

export const getVideoRefreshContextInternal = internalQuery({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (ctx, { jobId }) => {
		return await getVideoContext(
			ctx,
			jobId,
			youtubeVideoRefreshTask,
			'Video refresh job not found.'
		);
	}
});

export const getCaptionFetchContextInternal = internalQuery({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (ctx, { jobId }) => {
		return await getVideoContext(
			ctx,
			jobId,
			youtubeCaptionFetchTask,
			'Caption fetch job not found.'
		);
	}
});

export const getTitleUpdateContextInternal = internalQuery({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (ctx, { jobId }) => {
		const context = await getVideoContext(
			ctx,
			jobId,
			youtubeTitleUpdateTask,
			'Title update job not found.'
		);

		if (!context.job || !context.video) {
			return { ...context, title: null };
		}

		const input = parseJobInput(context.job.input);
		const title = typeof input.title === 'string' ? input.title.trim() : '';

		if (!title) {
			return { ...context, title: null, error: 'Choose a title before updating YouTube.' };
		}

		return { ...context, title };
	}
});

export const getChannelSyncContextInternal = internalQuery({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (ctx, { jobId }) => {
		const job = await ctx.db.get(jobId);

		if (!isWorkflowJob(job, youtubeChannelSyncTask)) {
			return { job: null, error: 'YouTube channel sync job not found.' };
		}

		return { job, error: null };
	}
});

async function getVideoContext(
	ctx: QueryCtx,
	jobId: Id<'workflowJobs'>,
	task: WorkflowJobTask,
	notFoundMessage: string
) {
	const job = await ctx.db.get(jobId);

	if (!isWorkflowJob(job, task)) {
		return { job: null, video: null, error: notFoundMessage };
	}

	if (!job.videoId) {
		return { job, video: null, error: 'Video job is missing a video.' };
	}

	const video = await ctx.db.get(job.videoId);

	if (!video || video.organizationId !== job.organizationId) {
		return { job, video: null, error: 'Video not found.' };
	}

	return { job, video, error: null };
}

function isWorkflowJob(
	job: Doc<'workflowJobs'> | null,
	task: WorkflowJobTask
): job is Doc<'workflowJobs'> {
	return Boolean(job && job.task === task);
}

function parseJobInput(input: string | undefined) {
	if (!input) {
		return {};
	}

	try {
		return JSON.parse(input) as Record<string, unknown>;
	} catch {
		return {};
	}
}
