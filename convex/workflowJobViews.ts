import { v } from 'convex/values';
import { internalQuery, query } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';
import { workflowJobTaskValidator, type WorkflowJobTask } from './workflowJobTypes';
import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

export const getLatestForEventTask = query({
	args: {
		eventId: v.id('events'),
		task: workflowJobTaskValidator
	},
	handler: async (ctx, { eventId, task }) => {
		const organizationId = await requireOrganizationId(ctx);
		const event = await ctx.db.get(eventId);

		if (!documentBelongsToOrganization(event, organizationId)) {
			return null;
		}

		return await findLatestByEventTask(ctx, organizationId, eventId, task);
	}
});

export const getLatestForVideoTask = query({
	args: {
		videoId: v.id('videos'),
		task: workflowJobTaskValidator
	},
	handler: async (ctx, { videoId, task }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await ctx.db.get(videoId);

		if (!documentBelongsToOrganization(video, organizationId)) {
			return null;
		}

		return await findLatestByVideoTask(ctx, organizationId, videoId, task);
	}
});

export const getLatestByKey = query({
	args: {
		key: v.string(),
		task: workflowJobTaskValidator
	},
	handler: async (ctx, { key, task }) => {
		const organizationId = await requireOrganizationId(ctx);

		return await findLatestByKeyTask(ctx, organizationId, key, task);
	}
});

export const findInternal = internalQuery({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (ctx, { jobId }) => {
		return await ctx.db.get(jobId);
	}
});

async function findLatestByEventTask(
	ctx: QueryCtx,
	organizationId: string,
	eventId: Id<'events'>,
	task: WorkflowJobTask
) {
	const jobs = await ctx.db
		.query('workflowJobs')
		.withIndex('by_organizationId_and_eventId_and_task_and_queuedAt', (q) =>
			q.eq('organizationId', organizationId).eq('eventId', eventId).eq('task', task)
		)
		.order('desc')
		.take(1);

	return jobs[0] ?? null;
}

async function findLatestByVideoTask(
	ctx: QueryCtx,
	organizationId: string,
	videoId: Id<'videos'>,
	task: WorkflowJobTask
) {
	const jobs = await ctx.db
		.query('workflowJobs')
		.withIndex('by_organizationId_and_videoId_and_task_and_queuedAt', (q) =>
			q.eq('organizationId', organizationId).eq('videoId', videoId).eq('task', task)
		)
		.order('desc')
		.take(1);

	return jobs[0] ?? null;
}

async function findLatestByKeyTask(
	ctx: QueryCtx,
	organizationId: string,
	key: string,
	task: WorkflowJobTask
) {
	const jobs = await ctx.db
		.query('workflowJobs')
		.withIndex('by_organizationId_and_task_and_key_and_queuedAt', (q) =>
			q.eq('organizationId', organizationId).eq('task', task).eq('key', key)
		)
		.order('desc')
		.take(1);

	return jobs[0] ?? null;
}
