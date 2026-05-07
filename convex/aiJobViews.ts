import { v } from 'convex/values';
import { internalQuery, query } from './_generated/server';
import { descriptionGenerationTask } from './aiJobTypes';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import type { DescriptionGenerationInput } from '../src/lib/description-generation';

export const getLatestDescriptionGenerationForVideo = query({
	args: {
		videoId: v.id('videos')
	},
	handler: async (ctx, { videoId }) => {
		const jobs = await collectDescriptionGenerationJobs(ctx, videoId, 1);

		return jobs[0] ?? null;
	}
});

export const getDescriptionGenerationContextInternal = internalQuery({
	args: {
		jobId: v.id('aiJobs')
	},
	handler: async (ctx, { jobId }) => {
		const job = await ctx.db.get(jobId);

		if (!isDescriptionGenerationJob(job)) {
			return {
				job: null,
				input: null,
				error: 'Description generation job not found.'
			};
		}

		const video = await ctx.db.get(job.videoId);

		if (!video) {
			return {
				job,
				input: null,
				error: 'Video not found.'
			};
		}

		const caption = job.captionId ? await ctx.db.get(job.captionId) : null;

		if (!caption || caption.videoId !== video._id) {
			return {
				job,
				input: null,
				error: 'Fetch captions before generating a structured description.'
			};
		}

		return {
			job,
			input: await buildDescriptionGenerationInput(ctx, video, caption),
			error: null
		};
	}
});

async function collectDescriptionGenerationJobs(
	ctx: QueryCtx,
	videoId: Id<'videos'>,
	limit: number
) {
	return await ctx.db
		.query('aiJobs')
		.withIndex('by_task_and_videoId_and_queuedAt', (q) =>
			q.eq('task', descriptionGenerationTask).eq('videoId', videoId)
		)
		.order('desc')
		.take(limit);
}

async function buildDescriptionGenerationInput(
	ctx: QueryCtx,
	video: Doc<'videos'>,
	caption: Doc<'videoCaptions'>
): Promise<DescriptionGenerationInput> {
	const speakerAssignments = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
		.take(100);
	const speakers = [];

	for (const assignment of speakerAssignments.sort((a, b) => a.position - b.position)) {
		const speaker = await ctx.db.get(assignment.speakerId);

		if (speaker) {
			speakers.push({
				name: speaker.name,
				...(speaker.company !== undefined ? { company: speaker.company } : {}),
				...(speaker.position !== undefined ? { position: speaker.position } : {})
			});
		}
	}

	const playlistAssignments = await ctx.db
		.query('playlistAssignments')
		.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
		.take(100);
	const assignments = [];

	for (const assignment of playlistAssignments) {
		const event = await ctx.db.get(assignment.eventId);

		if (event) {
			assignments.push({
				assignmentId: assignment._id,
				event: {
					name: event.name,
					...(event.editionTitle !== undefined ? { editionTitle: event.editionTitle } : {}),
					...(event.year !== undefined ? { year: event.year } : {}),
					...(event.titleFormat !== undefined ? { titleFormat: event.titleFormat } : {})
				}
			});
		}
	}

	return {
		video: {
			youtubeVideoId: video.youtubeVideoId,
			title: video.title,
			...(video.description !== undefined ? { description: video.description } : {}),
			...(video.channelTitle !== undefined ? { channelTitle: video.channelTitle } : {}),
			...(video.publishedAt !== undefined ? { publishedAt: video.publishedAt } : {}),
			...(video.videoPublishedAt !== undefined ? { videoPublishedAt: video.videoPublishedAt } : {}),
			...(video.videoType !== undefined ? { videoType: video.videoType } : {})
		},
		speakers,
		assignments,
		caption: {
			...(caption.language !== undefined ? { language: caption.language } : {}),
			...(caption.name !== undefined ? { name: caption.name } : {}),
			...(caption.trackKind !== undefined ? { trackKind: caption.trackKind } : {}),
			body: caption.body
		},
		host: {
			label: 'WorkOS',
			url: 'https://workos.com'
		}
	};
}

function isDescriptionGenerationJob(
	job: Doc<'aiJobs'> | null
): job is Doc<'aiJobs'> & { task: 'descriptionGeneration' } {
	return Boolean(job && job.task === descriptionGenerationTask);
}
