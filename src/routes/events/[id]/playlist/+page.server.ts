import { error, fail } from '@sveltejs/kit';
import { getConvexClientForEvent } from '$lib/server/convex';
import { isVideoType, normalizeVideoType } from '$lib/title-format';
import {
	youtubePlaylistUrl,
	youtubeStudioPlaylistContentUrl,
	youtubeStudioPlaylistEditUrl
} from '$lib/youtube';
import {
	buildTitleAiValidationInputs,
	titleAiValidationInputKey,
	type TitleAiValidationInput
} from '$lib/title-ai-validation';
import { pendingVideoValidation, type VideoValidation } from '$lib/video-validation';
import { api } from '../../../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '../../../../../convex/_generated/dataModel';
import type { Actions, PageServerLoad } from './$types';

type AssignmentRow = FunctionReturnType<typeof api.playlistAssignmentViews.getForEvent>[number];
type EventRow = NonNullable<FunctionReturnType<typeof api.events.find>>;
type EventPlaylistStats = FunctionReturnType<
	typeof api.eventPlaylistStats.collectByEventId
>[number];

function validationFilterFromUrl(url: URL) {
	const id = url.searchParams.get('validation')?.trim();
	const statusParam = url.searchParams.get('status');
	const status =
		statusParam === 'pass' ||
		statusParam === 'fail' ||
		statusParam === 'info' ||
		statusParam === 'pending'
			? statusParam
			: null;

	return id ? { id, status } : null;
}

function optionalString(data: FormData, key: string) {
	const value = data.get(key);
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function videoRecordForValidation(row: AssignmentRow) {
	const speaker = row.speakers.map((speakerRow) => speakerRow.speaker.name).join(', ');
	const company = [
		...new Set(
			row.speakers
				.map((speakerRow) => speakerRow.speaker.company)
				.filter((value): value is string => Boolean(value))
		)
	].join(', ');
	const position = [
		...new Set(
			row.speakers
				.map((speakerRow) => speakerRow.speaker.position)
				.filter((value): value is string => Boolean(value))
		)
	].join(', ');

	return {
		speaker: speaker || undefined,
		company: company || undefined,
		position: position || undefined,
		titleOverride: row.video.titleOverride,
		videoTitleFormat: row.video.videoTitleFormat,
		videoType: row.video.videoType
	};
}

function speakerRecordsForValidation(row: AssignmentRow) {
	return row.speakers.map((speakerRow) => ({
		name: speakerRow.speaker.name,
		company: speakerRow.speaker.company,
		position: speakerRow.speaker.position
	}));
}

function titleAiInputsForAssignments(assignments: AssignmentRow[], event: EventRow) {
	const inputsByKey = new Map<string, TitleAiValidationInput>();

	for (const row of assignments) {
		for (const input of buildTitleAiValidationInputs({
			videoId: row.video._id,
			title: row.video.title,
			event,
			speakers: speakerRecordsForValidation(row),
			video: videoRecordForValidation(row),
			disabledTitleValidationIds: row.video.disabledTitleValidationIds
		})) {
			inputsByKey.set(titleAiValidationInputKey(input), input);
		}
	}

	return [...inputsByKey.values()];
}

async function cachedTitleAiChecksByVideoId(
	client: ReturnType<typeof getConvexClientForEvent>,
	assignments: AssignmentRow[],
	event: EventRow
) {
	const inputs = titleAiInputsForAssignments(assignments, event);

	if (!inputs.length) {
		return {};
	}

	const cachedTitleAiChecks = await client.action(api.videoWorkflows.collectCachedTitleAiChecks, {
		inputs
	});
	const validationsByVideoId: Record<string, VideoValidation[]> = {};

	for (const row of assignments) {
		const validations = buildTitleAiValidationInputs({
			videoId: row.video._id,
			title: row.video.title,
			event,
			speakers: speakerRecordsForValidation(row),
			video: videoRecordForValidation(row),
			disabledTitleValidationIds: row.video.disabledTitleValidationIds
		}).map((input) => {
			const validation =
				cachedTitleAiChecks.validationsByInputKey[titleAiValidationInputKey(input)];

			return validation ?? pendingVideoValidation(input.checkId, input.label);
		});

		validationsByVideoId[row.video.youtubeVideoId] = validations;
	}

	return validationsByVideoId;
}

function storedPlaylistForEvent(
	event: EventRow,
	stats: EventPlaylistStats | null,
	assignments: AssignmentRow[]
) {
	const playlistId = stats?.playlistId ?? event.youtubePlaylistId;

	if (!playlistId || (!stats && assignments.length === 0)) {
		return null;
	}

	return {
		playlistId,
		title: stats?.playlistTitle ?? playlistId,
		channelTitle: stats?.playlistChannelTitle,
		itemCount: stats?.playlistItemCount,
		url: youtubePlaylistUrl(playlistId),
		studioEditUrl: youtubeStudioPlaylistEditUrl(playlistId),
		studioContentUrl: youtubeStudioPlaylistContentUrl(playlistId),
		videos: assignments.map((row) => ({
			playlistItemId: row.assignment.playlistItemId,
			videoId: row.video.youtubeVideoId,
			...(row.video.youtubeChannelId !== undefined
				? { channelId: row.video.youtubeChannelId }
				: {}),
			title: row.video.title,
			...(row.video.description !== undefined ? { description: row.video.description } : {}),
			position: row.assignment.position,
			videoUrl: row.video.videoUrl,
			playlistVideoUrl: row.assignment.playlistVideoUrl,
			studioEditUrl: row.video.studioEditUrl,
			...(row.video.thumbnailUrl !== undefined ? { thumbnailUrl: row.video.thumbnailUrl } : {}),
			...(row.video.channelTitle !== undefined ? { channelTitle: row.video.channelTitle } : {}),
			...(row.video.publishedAt !== undefined ? { publishedAt: row.video.publishedAt } : {}),
			...(row.video.videoPublishedAt !== undefined
				? { videoPublishedAt: row.video.videoPublishedAt }
				: {})
		}))
	};
}

export const load: PageServerLoad = async (requestEvent) => {
	const { params, url } = requestEvent;
	const client = getConvexClientForEvent(requestEvent);
	const validationFilter = validationFilterFromUrl(url);
	const event = await client.query(api.events.find, {
		id: params.id as Id<'events'>
	});

	if (!event) {
		throw error(404, 'Event not found.');
	}

	if (!event.youtubePlaylistId) {
		return {
			event,
			playlist: null,
			playlistAssignments: [],
			playlistError: null,
			validationFilter,
			titleAiChecksByVideoId: {},
			titleAiChecksError: null,
			syncJob: null
		};
	}

	const [playlistAssignments, statsRows, syncJob] = await Promise.all([
		client.query(api.playlistAssignmentViews.getForEvent, {
			eventId: event._id
		}),
		client.query(api.eventPlaylistStats.collectByEventId, {
			eventIds: [event._id]
		}),
		client.query(api.workflowJobViews.getLatestForEventTask, {
			eventId: event._id,
			task: 'youtubePlaylistSync'
		})
	]);
	const playlist = storedPlaylistForEvent(event, statsRows[0] ?? null, playlistAssignments);
	const titleAiChecksByVideoId = await cachedTitleAiChecksByVideoId(
		client,
		playlistAssignments,
		event
	);

	return {
		event,
		playlist,
		playlistAssignments,
		playlistError: null,
		validationFilter,
		titleAiChecksByVideoId,
		titleAiChecksError: null,
		syncJob
	};
};

export const actions: Actions = {
	syncPlaylist: async (event) => {
		const client = getConvexClientForEvent(event);
		const foundEvent = await client.query(api.events.find, {
			id: event.params.id as Id<'events'>
		});

		if (!foundEvent) {
			throw error(404, 'Event not found.');
		}

		const result = await client.mutation(api.youtubeCommands.requestPlaylistSync, {
			eventId: foundEvent._id
		});

		if (result.error) {
			return fail(400, {
				playlistSyncError: result.error
			});
		}

		return {
			playlistSyncMessage: 'Queued playlist sync.'
		};
	},

	updateVideoType: async (event) => {
		const { request } = event;
		const client = getConvexClientForEvent(event);
		const data = await request.formData();
		const videoId = optionalString(data, 'videoId');
		const videoType = optionalString(data, 'videoType');

		if (!videoId || !isVideoType(videoType)) {
			return fail(400, {
				videoTypeError: 'Choose a valid video type.'
			});
		}

		await client.mutation(api.videoCommands.setMetadata, {
			videoId: videoId as Id<'videos'>,
			videoType: normalizeVideoType(videoType)
		});

		return {
			videoTypeMessage: 'Video type updated.',
			videoTypeVideoId: videoId
		};
	}
};
