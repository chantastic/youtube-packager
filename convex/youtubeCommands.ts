import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { internal } from './_generated/api';
import { requireDocumentInOrganization, requireWorkOSAuthContext } from './authz';
import {
	youtubeCaptionFetchTask,
	youtubeChannelSyncTask,
	youtubePlaylistSyncTask,
	youtubeTitleUpdateTask,
	youtubeVideoRefreshTask,
	type WorkflowJobEntityType,
	type WorkflowJobTask
} from './workflowJobTypes';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

export const requestPlaylistSync = mutation({
	args: {
		eventId: v.id('events')
	},
	handler: async (ctx, { eventId }) => {
		const auth = await requireWorkOSAuthContext(ctx);
		const event = requireDocumentInOrganization(
			await ctx.db.get(eventId),
			auth.organizationId,
			'Event not found.'
		);

		if (!event.youtubePlaylistId) {
			return { job: null, error: 'Link a playlist before syncing videos.' };
		}

		const job = await queueWorkflowJob(ctx, {
			organizationId: auth.organizationId,
			requestedByUserId: auth.userId,
			task: youtubePlaylistSyncTask,
			key: eventJobKey(event._id),
			entityType: 'event',
			eventId: event._id,
			input: JSON.stringify({ youtubePlaylistId: event.youtubePlaylistId })
		});

		await ctx.scheduler.runAfter(0, internal.youtubeWorkflows.syncPlaylistForJob, {
			jobId: job._id
		});

		return { job, error: null };
	}
});

export const requestVideoRefresh = mutation({
	args: {
		videoId: v.id('videos')
	},
	handler: async (ctx, { videoId }) => {
		const auth = await requireWorkOSAuthContext(ctx);
		const video = requireDocumentInOrganization(
			await ctx.db.get(videoId),
			auth.organizationId,
			'Video not found.'
		);
		const job = await queueWorkflowJob(ctx, {
			organizationId: auth.organizationId,
			requestedByUserId: auth.userId,
			task: youtubeVideoRefreshTask,
			key: videoJobKey(video._id),
			entityType: 'video',
			videoId: video._id
		});

		await ctx.scheduler.runAfter(0, internal.youtubeWorkflows.refreshVideoForJob, {
			jobId: job._id
		});

		return { job, error: null };
	}
});

export const requestCaptionFetch = mutation({
	args: {
		videoId: v.id('videos')
	},
	handler: async (ctx, { videoId }) => {
		const auth = await requireWorkOSAuthContext(ctx);
		const video = requireDocumentInOrganization(
			await ctx.db.get(videoId),
			auth.organizationId,
			'Video not found.'
		);
		const job = await queueWorkflowJob(ctx, {
			organizationId: auth.organizationId,
			requestedByUserId: auth.userId,
			task: youtubeCaptionFetchTask,
			key: videoJobKey(video._id),
			entityType: 'video',
			videoId: video._id
		});

		await ctx.scheduler.runAfter(0, internal.youtubeWorkflows.fetchCaptionsForJob, {
			jobId: job._id
		});

		return { job, error: null };
	}
});

export const requestTitleUpdate = mutation({
	args: {
		videoId: v.id('videos'),
		title: v.string()
	},
	handler: async (ctx, { videoId, title }) => {
		const trimmedTitle = title.trim();

		if (!trimmedTitle) {
			return { job: null, error: 'Choose a title before updating YouTube.' };
		}

		if (trimmedTitle.length > 100) {
			return { job: null, error: 'YouTube video titles must be 100 characters or fewer.' };
		}

		if (/[<>]/.test(trimmedTitle)) {
			return { job: null, error: 'YouTube video titles cannot contain < or >.' };
		}

		const auth = await requireWorkOSAuthContext(ctx);
		const video = requireDocumentInOrganization(
			await ctx.db.get(videoId),
			auth.organizationId,
			'Video not found.'
		);
		const job = await createWorkflowJob(ctx, {
			organizationId: auth.organizationId,
			requestedByUserId: auth.userId,
			task: youtubeTitleUpdateTask,
			key: `${videoJobKey(video._id)}:${Date.now()}`,
			entityType: 'video',
			videoId: video._id,
			input: JSON.stringify({ title: trimmedTitle })
		});

		await ctx.scheduler.runAfter(0, internal.youtubeWorkflows.pushTitleForJob, {
			jobId: job._id
		});

		return { job, error: null };
	}
});

export const requestChannelSync = mutation({
	args: {},
	handler: async (ctx) => {
		const auth = await requireWorkOSAuthContext(ctx);
		const job = await queueWorkflowJob(ctx, {
			organizationId: auth.organizationId,
			requestedByUserId: auth.userId,
			task: youtubeChannelSyncTask,
			key: 'integration:youtube',
			entityType: 'integration'
		});

		await ctx.scheduler.runAfter(0, internal.youtubeWorkflows.syncAuthorizedChannelsForJob, {
			jobId: job._id
		});

		return { job, error: null };
	}
});

async function queueWorkflowJob(
	ctx: MutationCtx,
	input: WorkflowJobCreateInput
): Promise<Doc<'workflowJobs'>> {
	const inFlightJob = await findInFlightWorkflowJob(
		ctx,
		input.organizationId,
		input.task,
		input.key
	);

	if (inFlightJob) {
		return inFlightJob;
	}

	return await createWorkflowJob(ctx, input);
}

async function createWorkflowJob(
	ctx: MutationCtx,
	input: WorkflowJobCreateInput
): Promise<Doc<'workflowJobs'>> {
	const now = Date.now();
	const jobId = await ctx.db.insert('workflowJobs', {
		...input,
		status: 'queued',
		queuedAt: now,
		updatedAt: now
	});
	const job = await ctx.db.get(jobId);

	if (!job) {
		throw new Error('Workflow job could not be created.');
	}

	return job;
}

async function findInFlightWorkflowJob(
	ctx: MutationCtx,
	organizationId: string,
	task: WorkflowJobTask,
	key: string
) {
	const jobs = await ctx.db
		.query('workflowJobs')
		.withIndex('by_organizationId_and_task_and_key_and_queuedAt', (q) =>
			q.eq('organizationId', organizationId).eq('task', task).eq('key', key)
		)
		.order('desc')
		.take(10);

	return jobs.find((job) => job.status === 'queued' || job.status === 'running') ?? null;
}

function eventJobKey(eventId: Id<'events'>) {
	return `event:${eventId}`;
}

function videoJobKey(videoId: Id<'videos'>) {
	return `video:${videoId}`;
}

type WorkflowJobCreateInput = {
	organizationId: string;
	requestedByUserId: string;
	task: WorkflowJobTask;
	key: string;
	entityType: WorkflowJobEntityType;
	eventId?: Id<'events'>;
	videoId?: Id<'videos'>;
	input?: string;
};
