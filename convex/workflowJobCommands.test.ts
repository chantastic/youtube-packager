/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob('./**/*.ts');

async function seedVideo(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		return await ctx.db.insert('videos', {
			organizationId: 'org_test',
			youtubeVideoId: 'video-1',
			title: 'Build Agent-Native Auth',
			videoUrl: 'https://www.youtube.com/watch?v=video-1',
			studioEditUrl: 'https://studio.youtube.com/video/video-1/edit',
			lastFetchedAt: Date.now()
		});
	});
}

async function insertWorkflowJob(
	t: ReturnType<typeof convexTest>,
	input: {
		key: string;
		queuedAt: number;
		status: 'queued' | 'running' | 'complete' | 'error';
		videoId?: Id<'videos'>;
	}
) {
	return await t.run(async (ctx) => {
		return await ctx.db.insert('workflowJobs', {
			organizationId: 'org_test',
			requestedByUserId: 'user_test',
			task: 'youtubeTitleUpdate',
			entityType: 'video',
			videoId: input.videoId,
			key: input.key,
			status: input.status,
			queuedAt: input.queuedAt,
			updatedAt: input.queuedAt,
			...(input.status === 'complete' || input.status === 'error'
				? { completedAt: input.queuedAt }
				: {})
		});
	});
}

async function collectWorkflowJobs(t: ReturnType<typeof convexTest>, videoId: Id<'videos'>) {
	return await t.run(async (ctx) => {
		return await ctx.db
			.query('workflowJobs')
			.withIndex('by_organizationId_and_videoId_and_task_and_queuedAt', (q) =>
				q.eq('organizationId', 'org_test').eq('videoId', videoId).eq('task', 'youtubeTitleUpdate')
			)
			.collect();
	});
}

test('recordCompleteInternal keeps only recent terminal jobs in a workflow stream', async () => {
	const t = convexTest(schema, modules);
	const videoId = await seedVideo(t);
	const jobIds: Array<Id<'workflowJobs'>> = [];

	for (let index = 0; index < 12; index += 1) {
		jobIds.push(
			await insertWorkflowJob(t, {
				videoId,
				key: `video:${videoId}:${index}`,
				queuedAt: index + 1,
				status: index === 11 ? 'queued' : 'complete'
			})
		);
	}

	await t.mutation(internal.workflowJobCommands.recordCompleteInternal, {
		jobId: jobIds[11],
		result: 'ok'
	});

	const jobs = await collectWorkflowJobs(t, videoId);

	expect(jobs).toHaveLength(10);
	expect(jobs.map((job) => job.queuedAt).sort((a, b) => a - b)).toEqual([
		3, 4, 5, 6, 7, 8, 9, 10, 11, 12
	]);
	expect(jobs.every((job) => job.status === 'complete')).toBe(true);
});

test('workflow job retention preserves active jobs even when terminal history is capped', async () => {
	const t = convexTest(schema, modules);
	const videoId = await seedVideo(t);
	const jobIds: Array<Id<'workflowJobs'>> = [];

	for (let index = 0; index < 15; index += 1) {
		jobIds.push(
			await insertWorkflowJob(t, {
				videoId,
				key: `video:${videoId}:${index}`,
				queuedAt: index + 1,
				status: index < 2 ? 'running' : index === 14 ? 'queued' : 'complete'
			})
		);
	}

	await t.mutation(internal.workflowJobCommands.recordCompleteInternal, {
		jobId: jobIds[14],
		result: 'ok'
	});

	const jobs = await collectWorkflowJobs(t, videoId);
	const terminalJobs = jobs.filter((job) => job.status === 'complete' || job.status === 'error');
	const runningJobs = jobs.filter((job) => job.status === 'running');

	expect(jobs).toHaveLength(12);
	expect(terminalJobs).toHaveLength(10);
	expect(terminalJobs.map((job) => job.queuedAt).sort((a, b) => a - b)).toEqual([
		6, 7, 8, 9, 10, 11, 12, 13, 14, 15
	]);
	expect(runningJobs.map((job) => job.queuedAt).sort((a, b) => a - b)).toEqual([1, 2]);
});
