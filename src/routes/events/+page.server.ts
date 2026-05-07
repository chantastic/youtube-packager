import { fail } from '@sveltejs/kit';
import { extractYouTubePlaylistId } from '$lib/youtube';
import { getConvexClient } from '$lib/server/convex';
import { validateTitleAiChecksWithAnthropic } from '$lib/server/anthropic-title-validation';
import {
	planAiValidationCache,
	saveAiValidationCache,
	type AiValidationCacheEntry,
	type AiValidationCachePlan
} from '$lib/server/ai-validation-cache';
import {
	buildTitleAiValidationInputs,
	titleAiValidationInputKey,
	type TitleAiValidationInput
} from '$lib/title-ai-validation';
import {
	getConnectedYouTubeAccessToken,
	YouTubeConnectionError,
	youtubeAuthContext
} from '$lib/server/youtube-connection';
import { getYouTubePlaylistData, YouTubeDataApiError } from '$lib/server/youtube-data-api';
import { defaultEventType, isEventType } from '$lib/event-type';
import {
	pendingVideoValidation,
	summarizeVideoValidations,
	validateVideoBaseline,
	videoValidationContextKey
} from '$lib/video-validation';
import { api } from '../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel';
import type { PageServerLoad, Actions } from './$types';

type AssignmentRow = FunctionReturnType<typeof api.playlistAssignmentView.getForEvent>[number];
type EventRow = FunctionReturnType<typeof api.events.collect>[number];
type ValidationBuildState =
	| {
			kind: 'playlist';
			label: 'Build validations';
	  }
	| {
			kind: 'ai';
			label: 'Build AI checks';
			missingCount: number;
	  };

function optionalString(data: FormData, key: string) {
	const value = data.get(key);
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function eventType(data: FormData) {
	const value = optionalString(data, 'eventType');

	return isEventType(value) ? value : defaultEventType;
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
			videoId: row.video.youtubeVideoId,
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

function aiValidationEntriesByInputKey(cachePlan: AiValidationCachePlan | null) {
	return new Map(
		(cachePlan?.entries ?? []).map((entry) => [titleAiValidationInputKey(entry), entry])
	);
}

function cachedAiValidationsForRow(
	row: AssignmentRow,
	event: EventRow,
	cachePlan: AiValidationCachePlan | null,
	entriesByInputKey: Map<string, AiValidationCacheEntry>
) {
	return buildTitleAiValidationInputs({
		videoId: row.video.youtubeVideoId,
		title: row.video.title,
		event,
		speakers: speakerRecordsForValidation(row),
		video: videoRecordForValidation(row)
	}).map((input) => {
		const entry = entriesByInputKey.get(titleAiValidationInputKey(input));

		return entry
			? (cachePlan?.cachedValidationsByCacheKey[entry.cacheKeyString] ??
					pendingVideoValidation(input.checkId, input.label))
			: pendingVideoValidation(input.checkId, input.label);
	});
}

async function buildAiValidationCache(inputs: TitleAiValidationInput[]) {
	if (!inputs.length) {
		return { checked: 0, total: 0, error: null as string | null };
	}

	const cachePlan = await planAiValidationCache(inputs);
	const freshResult = await validateTitleAiChecksWithAnthropic(
		cachePlan.misses.map((entry) => ({
			...entry,
			requestId: entry.cacheKeyString
		}))
	);
	const now = Date.now();
	const freshEntries = cachePlan.misses.flatMap((entry) => {
		const validation = freshResult.validationsByRequestId[entry.cacheKeyString];

		return validation
			? [
					{
						...entry,
						validation,
						checkedAt: now
					}
				]
			: [];
	});

	await saveAiValidationCache(freshEntries);

	return {
		checked: inputs.length - cachePlan.misses.length + freshEntries.length,
		total: inputs.length,
		error: freshResult.error
	};
}

async function syncPlaylistForEvent(event: EventRow, accessToken: string) {
	if (!event.youtubePlaylistId) {
		throw new Error('Event has no playlist.');
	}

	const client = getConvexClient();
	const playlist = await getYouTubePlaylistData(event.youtubePlaylistId, accessToken);

	await client.mutation(api.videos.upsertPlaylistSnapshotByEventId, {
		eventId: event._id,
		playlist: {
			playlistId: playlist.playlistId,
			...(playlist.title !== undefined ? { title: playlist.title } : {}),
			...(playlist.channelTitle !== undefined ? { channelTitle: playlist.channelTitle } : {}),
			...(playlist.itemCount !== undefined ? { itemCount: playlist.itemCount } : {}),
			validationContextKey: videoValidationContextKey(event),
			validationStats: [],
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

	return playlist;
}

export const load: PageServerLoad = async () => {
	const client = getConvexClient();
	const events = await client.query(api.events.collect);
	const assignmentsByEventEntries = await Promise.all(
		events.map(async (event) => {
			if (!event.youtubePlaylistId) {
				return [event._id, [] as AssignmentRow[]] as const;
			}

			const assignments = await client.query(api.playlistAssignmentView.getForEvent, {
				eventId: event._id
			});

			return [event._id, assignments] as const;
		})
	);
	const assignmentsByEventId = new Map(assignmentsByEventEntries);
	const titleAiInputs = assignmentsByEventEntries.flatMap(([eventId, rows]) => {
		const event = events.find((candidate) => candidate._id === eventId);

		return event ? titleAiInputsForAssignments(rows, event) : [];
	});
	const aiCache = titleAiInputs.length > 0 ? await planAiValidationCache(titleAiInputs) : null;
	const aiEntriesByInputKey = aiValidationEntriesByInputKey(aiCache);

	const validationStats = events.flatMap((event) => {
		const assignments = assignmentsByEventId.get(event._id) ?? [];

		if (!event.youtubePlaylistId || !assignments.length) {
			return [];
		}

		return [
			[
				event._id,
				summarizeVideoValidations(
					assignments.map((row) => [
						...validateVideoBaseline(row.video.title, event, {
							speakers: speakerRecordsForValidation(row),
							video: videoRecordForValidation(row)
						}),
						...cachedAiValidationsForRow(row, event, aiCache, aiEntriesByInputKey)
					])
				)
			] as const
		];
	});
	const validationBuildState: Array<readonly [Id<'events'>, ValidationBuildState]> = [];

	for (const event of events) {
		if (!event.youtubePlaylistId) {
			continue;
		}

		const assignments = assignmentsByEventId.get(event._id) ?? [];

		if (!assignments.length) {
			validationBuildState.push([
				event._id,
				{
					kind: 'playlist',
					label: 'Build validations'
				}
			]);
			continue;
		}

		const missingAiCount = titleAiInputsForAssignments(assignments, event).filter((input) => {
			const entry = aiEntriesByInputKey.get(titleAiValidationInputKey(input));

			return !entry || !aiCache?.cachedValidationsByCacheKey[entry.cacheKeyString];
		}).length;

		if (missingAiCount === 0) {
			continue;
		}

		validationBuildState.push([
			event._id,
			{
				kind: 'ai',
				label: 'Build AI checks',
				missingCount: missingAiCount
			}
		]);
	}

	return {
		events,
		validationStatsByEventId: Object.fromEntries(validationStats),
		validationBuildStateByEventId: Object.fromEntries(validationBuildState)
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		await getConvexClient().mutation(api.events.upsert, {
			name: String(data.get('name')),
			editionTitle: optionalString(data, 'editionTitle'),
			eventType: eventType(data),
			year: Number(data.get('year')),
			titleFormat: optionalString(data, 'titleFormat'),
			youtubePlaylistId: extractYouTubePlaylistId(optionalString(data, 'youtubePlaylistId'))
		});
	},

	update: async ({ request }) => {
		const data = await request.formData();
		await getConvexClient().mutation(api.events.upsert, {
			id: String(data.get('id')) as Id<'events'>,
			name: String(data.get('name')),
			editionTitle: optionalString(data, 'editionTitle'),
			eventType: eventType(data),
			year: Number(data.get('year')),
			titleFormat: optionalString(data, 'titleFormat'),
			youtubePlaylistId: extractYouTubePlaylistId(optionalString(data, 'youtubePlaylistId'))
		});
	},

	remove: async ({ request }) => {
		const data = await request.formData();
		await getConvexClient().mutation(api.events.destroy, {
			id: String(data.get('id')) as Id<'events'>
		});
	},

	buildValidations: async ({ request, locals }) => {
		const data = await request.formData();
		const eventId = optionalString(data, 'eventId');

		if (!eventId) {
			return fail(400, {
				buildError: 'Choose an event before building validations.'
			});
		}

		const client = getConvexClient();
		const event = await client.query(api.events.find, {
			id: eventId as Id<'events'>
		});

		if (!event?.youtubePlaylistId) {
			return fail(400, {
				buildEventId: eventId,
				buildError: 'Link a playlist before building validations.'
			});
		}

		try {
			const auth = youtubeAuthContext({ locals });
			const accessToken = await getConnectedYouTubeAccessToken(auth);
			const playlist = await syncPlaylistForEvent(event, accessToken);
			const assignments = await client.query(api.playlistAssignmentView.getForEvent, {
				eventId: event._id
			});
			const aiChecks = await buildAiValidationCache(
				titleAiInputsForAssignments(assignments, event)
			);

			return {
				buildEventId: event._id,
				buildMessage: `Built validations for ${event.name}. Synced ${playlist.videos.length} videos and checked AI title validations for ${aiChecks.checked}/${aiChecks.total}.`,
				buildWarning: aiChecks.error
			};
		} catch (err) {
			if (err instanceof YouTubeDataApiError || err instanceof YouTubeConnectionError) {
				return fail(err.status, {
					buildEventId: eventId,
					buildError: err.message
				});
			}

			throw err;
		}
	}
};
