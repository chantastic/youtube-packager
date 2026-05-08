import { v } from 'convex/values';
import { query } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';
import { speakerRecordsForValidation, videoRecordForValidation } from './titleValidationContext';
import {
	buildTitleAiValidationInputs,
	type TitleAiValidationInput
} from '../src/lib/title-ai-validation';
import type { VideoTitleFormatRecord } from '../src/lib/title-format';
import { validateVideoBaseline } from '../src/lib/video-validation';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

export const get = query({
	args: {
		id: v.id('videos')
	},
	handler: async (ctx, { id }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await ctx.db.get(id);

		return documentBelongsToOrganization(video, organizationId)
			? await buildVideoView(ctx, video, organizationId)
			: null;
	}
});

export const getByRouteParam = query({
	args: {
		routeParam: v.string()
	},
	handler: async (ctx, { routeParam }) => {
		const organizationId = await requireOrganizationId(ctx);
		const id = ctx.db.normalizeId('videos', routeParam);

		if (id) {
			const video = await ctx.db.get(id);

			if (documentBelongsToOrganization(video, organizationId)) {
				return {
					kind: 'id' as const,
					videoView: await buildVideoView(ctx, video, organizationId)
				};
			}
		}

		const video = await findVideoByYoutubeVideoId(ctx, routeParam, organizationId);

		if (!video) {
			return null;
		}

		return {
			kind: 'youtubeVideoId' as const,
			videoView: await buildVideoView(ctx, video, organizationId)
		};
	}
});

async function findVideoByYoutubeVideoId(
	ctx: QueryCtx,
	youtubeVideoId: string,
	organizationId: string
) {
	const scopedVideo = await ctx.db
		.query('videos')
		.withIndex('by_organizationId_and_youtubeVideoId', (q) =>
			q.eq('organizationId', organizationId).eq('youtubeVideoId', youtubeVideoId)
		)
		.unique();

	return scopedVideo;
}

async function buildVideoView(ctx: QueryCtx, video: Doc<'videos'>, organizationId: string) {
	const assignments = await ctx.db
		.query('playlistAssignments')
		.withIndex('by_organizationId_and_videoId', (q) =>
			q.eq('organizationId', organizationId).eq('videoId', video._id)
		)
		.take(100);
	const assignmentsWithEvents: Array<{
		assignment: Doc<'playlistAssignments'>;
		event: Doc<'events'>;
	}> = [];
	const speakerAssignments = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_organizationId_and_videoId', (q) =>
			q.eq('organizationId', organizationId).eq('videoId', video._id)
		)
		.take(100);
	const speakers: Array<{
		assignment: Doc<'videoSpeakers'>;
		speaker: Doc<'speakers'>;
	}> = [];

	for (const assignment of assignments) {
		const event = await ctx.db.get(assignment.eventId);

		if (documentBelongsToOrganization(event, organizationId)) {
			assignmentsWithEvents.push({ assignment, event });
		}
	}

	for (const speakerAssignment of speakerAssignments.sort((a, b) => a.position - b.position)) {
		const speaker = await ctx.db.get(speakerAssignment.speakerId);

		if (documentBelongsToOrganization(speaker, organizationId)) {
			speakers.push({ assignment: speakerAssignment, speaker });
		}
	}

	const titleContext = videoRecordForValidation(video, speakers);
	const speakerContext = speakerRecordsForValidation(speakers);
	const assignmentsWithValidations = assignmentsWithEvents.map((row) => ({
		...row,
		baselineValidations: validateVideoBaseline(video.title, row.event, {
			speakers: speakerContext,
			video: titleContext,
			disabledTitleValidationIds: video.disabledTitleValidationIds
		}),
		titleAiInputs: buildTitleAiValidationInputs({
			videoId: video._id,
			title: video.title,
			event: row.event,
			speakers: speakerContext,
			video: titleContext,
			disabledTitleValidationIds: video.disabledTitleValidationIds
		})
	}));

	return {
		video,
		titleContext,
		titleAiInputs: primaryTitleAiInputs(
			video,
			titleContext,
			speakerContext,
			assignmentsWithValidations
		),
		speakers,
		assignments: assignmentsWithValidations
	};
}

function primaryTitleAiInputs(
	video: Doc<'videos'>,
	titleContext: VideoTitleFormatRecord,
	speakerContext: Array<{ name: string; company?: string; position?: string }>,
	assignments: Array<{ titleAiInputs: TitleAiValidationInput[] }>
) {
	return (
		assignments[0]?.titleAiInputs ??
		buildTitleAiValidationInputs({
			videoId: video._id,
			title: video.title,
			speakers: speakerContext,
			video: titleContext,
			disabledTitleValidationIds: video.disabledTitleValidationIds
		})
	);
}
