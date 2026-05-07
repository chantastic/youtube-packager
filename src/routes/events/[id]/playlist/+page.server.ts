import { error, fail } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import {
	getConnectedYouTubeAccessToken,
	YouTubeConnectionError,
	youtubeAuthContext
} from '$lib/server/youtube-connection';
import { getYouTubePlaylistData, YouTubeDataApiError } from '$lib/server/youtube-data-api';
import { isVideoType, normalizeVideoType } from '$lib/title-format';
import { planAiValidationCache } from '$lib/server/ai-validation-cache';
import {
	buildTitleAiValidationInputs,
	titleAiValidationInputKey,
	type TitleAiValidationInput
} from '$lib/title-ai-validation';
import {
	pendingVideoValidation,
	summarizeVideoValidations,
	validateVideoBaseline,
	type VideoValidation,
	videoValidationContextKey
} from '$lib/video-validation';
import { api } from '../../../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '../../../../../convex/_generated/dataModel';
import type { Actions, PageServerLoad } from './$types';

type AssignmentRow = FunctionReturnType<typeof api.playlistAssignmentViews.getForEvent>[number];
type EventRow = NonNullable<FunctionReturnType<typeof api.events.find>>;

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
			video: videoRecordForValidation(row)
		})) {
			inputsByKey.set(titleAiValidationInputKey(input), input);
		}
	}

	return [...inputsByKey.values()];
}

async function cachedTitleAiValidationsByVideoId(assignments: AssignmentRow[], event: EventRow) {
	const inputs = titleAiInputsForAssignments(assignments, event);

	if (!inputs.length) {
		return {};
	}

	const cachePlan = await planAiValidationCache(inputs);
	const entriesByInputKey = new Map(
		cachePlan.entries.map((entry) => [titleAiValidationInputKey(entry), entry])
	);
	const validationsByVideoId: Record<string, VideoValidation[]> = {};

	for (const row of assignments) {
		const validations = buildTitleAiValidationInputs({
			videoId: row.video._id,
			title: row.video.title,
			event,
			speakers: speakerRecordsForValidation(row),
			video: videoRecordForValidation(row)
		}).map((input) => {
			const entry = entriesByInputKey.get(titleAiValidationInputKey(input));

			return entry
				? (cachePlan.cachedValidationsByCacheKey[entry.cacheKeyString] ??
						pendingVideoValidation(input.checkId, input.label))
				: pendingVideoValidation(input.checkId, input.label);
		});

		validationsByVideoId[row.video.youtubeVideoId] = validations;
	}

	return validationsByVideoId;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const auth = youtubeAuthContext({ locals });
	const client = getConvexClient();
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
			titleQualityValidationsByVideoId: {},
			titleQualityError: null
		};
	}

	try {
		const accessToken = await getConnectedYouTubeAccessToken(auth);
		const playlist = await getYouTubePlaylistData(event.youtubePlaylistId, accessToken);
		const validationStats = summarizeVideoValidations(
			playlist.videos.map((video) => validateVideoBaseline(video.title, event))
		);

		await client.mutation(api.videoCommands.recordPlaylistSnapshotByEventId, {
			eventId: event._id,
			playlist: {
				playlistId: playlist.playlistId,
				...(playlist.title !== undefined ? { title: playlist.title } : {}),
				...(playlist.channelTitle !== undefined ? { channelTitle: playlist.channelTitle } : {}),
				...(playlist.itemCount !== undefined ? { itemCount: playlist.itemCount } : {}),
				validationContextKey: videoValidationContextKey(event),
				validationStats,
				videos: playlist.videos.map((video) => ({
					playlistItemId: video.playlistItemId,
					youtubeVideoId: video.videoId,
					title: video.title,
					position: video.position,
					videoUrl: video.videoUrl,
					playlistVideoUrl: video.playlistVideoUrl,
					studioEditUrl: video.studioEditUrl,
					...(video.description !== undefined ? { description: video.description } : {}),
					...(video.thumbnailUrl !== undefined ? { thumbnailUrl: video.thumbnailUrl } : {}),
					...(video.channelTitle !== undefined ? { channelTitle: video.channelTitle } : {}),
					...(video.publishedAt !== undefined ? { publishedAt: video.publishedAt } : {}),
					...(video.videoPublishedAt !== undefined
						? { videoPublishedAt: video.videoPublishedAt }
						: {})
				}))
			}
		});
		const playlistAssignments = await client.query(api.playlistAssignmentViews.getForEvent, {
			eventId: event._id
		});
		const titleQualityValidationsByVideoId = await cachedTitleAiValidationsByVideoId(
			playlistAssignments,
			event
		);

		return {
			event,
			playlist,
			playlistAssignments,
			playlistError: null,
			validationFilter,
			titleQualityValidationsByVideoId,
			titleQualityError: null
		};
	} catch (err) {
		if (err instanceof YouTubeDataApiError || err instanceof YouTubeConnectionError) {
			return {
				event,
				playlist: null,
				playlistAssignments: [],
				playlistError: {
					status: err.status,
					message: err.message
				},
				validationFilter,
				titleQualityValidationsByVideoId: {},
				titleQualityError: null
			};
		}

		throw err;
	}
};

export const actions: Actions = {
	updateVideoType: async ({ request }) => {
		const data = await request.formData();
		const videoId = optionalString(data, 'videoId');
		const videoType = optionalString(data, 'videoType');

		if (!videoId || !isVideoType(videoType)) {
			return fail(400, {
				videoTypeError: 'Choose a valid video type.'
			});
		}

		await getConvexClient().mutation(api.videoCommands.setMetadata, {
			videoId: videoId as Id<'videos'>,
			videoType: normalizeVideoType(videoType)
		});

		return {
			videoTypeMessage: 'Video type updated.',
			videoTypeVideoId: videoId
		};
	}
};
