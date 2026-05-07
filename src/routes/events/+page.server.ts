import { fail } from '@sveltejs/kit';
import { extractYouTubePlaylistId } from '$lib/youtube';
import { getConvexClientForEvent } from '$lib/server/convex';
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
	type VideoValidation,
	videoValidationContextKey
} from '$lib/video-validation';
import { api } from '../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel';
import type { PageServerLoad, Actions } from './$types';

type AssignmentRow = FunctionReturnType<typeof api.playlistAssignmentViews.getForEvent>[number];
type EventRow = FunctionReturnType<typeof api.events.collect>[number];
type CachedTitleAiChecks = {
	validationsByInputKey: Record<string, VideoValidation>;
	cache: {
		hits: number;
		misses: number;
		writes: number;
		total: number;
	};
};
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

function cachedAiValidationsForRow(
	row: AssignmentRow,
	event: EventRow,
	cachedTitleAiChecks: CachedTitleAiChecks | null
) {
	return buildTitleAiValidationInputs({
		videoId: row.video._id,
		title: row.video.title,
		event,
		speakers: speakerRecordsForValidation(row),
		video: videoRecordForValidation(row),
		disabledTitleValidationIds: row.video.disabledTitleValidationIds
	}).map((input) => {
		const validation = cachedTitleAiChecks?.validationsByInputKey[titleAiValidationInputKey(input)];

		return validation ?? pendingVideoValidation(input.checkId, input.label);
	});
}

async function buildAiValidationCache(
	client: ReturnType<typeof getConvexClientForEvent>,
	inputs: TitleAiValidationInput[]
) {
	if (!inputs.length) {
		return { checked: 0, total: 0, error: null as string | null };
	}

	const result = await client.action(api.videoWorkflows.buildTitleAiChecks, {
		inputs
	});

	return {
		checked: result.cache.hits + result.cache.writes,
		total: result.cache.total,
		error: result.error
	};
}

async function syncPlaylistForEvent(
	client: ReturnType<typeof getConvexClientForEvent>,
	event: EventRow,
	accessToken: string
) {
	if (!event.youtubePlaylistId) {
		throw new Error('Event has no playlist.');
	}

	const playlist = await getYouTubePlaylistData(event.youtubePlaylistId, accessToken);

	await client.mutation(api.videoCommands.recordPlaylistSnapshotByEventId, {
		eventId: event._id,
		playlist: {
			playlistId: playlist.playlistId,
			...(playlist.channelId !== undefined ? { youtubeChannelId: playlist.channelId } : {}),
			...(playlist.title !== undefined ? { title: playlist.title } : {}),
			...(playlist.channelTitle !== undefined ? { channelTitle: playlist.channelTitle } : {}),
			...(playlist.itemCount !== undefined ? { itemCount: playlist.itemCount } : {}),
			validationContextKey: videoValidationContextKey(event),
			validationStats: [],
			videos: playlist.videos.map((video) => ({
				playlistItemId: video.playlistItemId,
				youtubeVideoId: video.videoId,
				...(video.channelId !== undefined ? { youtubeChannelId: video.channelId } : {}),
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

export const load: PageServerLoad = async (event) => {
	const client = getConvexClientForEvent(event);
	const events = await client.query(api.events.collect);
	const assignmentsByEventEntries = await Promise.all(
		events.map(async (event) => {
			if (!event.youtubePlaylistId) {
				return [event._id, [] as AssignmentRow[]] as const;
			}

			const assignments = await client.query(api.playlistAssignmentViews.getForEvent, {
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
	const aiCache =
		titleAiInputs.length > 0
			? await client.action(api.videoWorkflows.collectCachedTitleAiChecks, {
					inputs: titleAiInputs
				})
			: null;

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
							video: videoRecordForValidation(row),
							disabledTitleValidationIds: row.video.disabledTitleValidationIds
						}),
						...cachedAiValidationsForRow(row, event, aiCache)
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

		const missingAiCount = titleAiInputsForAssignments(assignments, event).filter(
			(input) => !aiCache?.validationsByInputKey[titleAiValidationInputKey(input)]
		).length;

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
	create: async (event) => {
		const { request } = event;
		const client = getConvexClientForEvent(event);
		const data = await request.formData();
		await client.mutation(api.events.upsert, {
			name: String(data.get('name')),
			editionTitle: optionalString(data, 'editionTitle'),
			eventType: eventType(data),
			year: Number(data.get('year')),
			titleFormat: optionalString(data, 'titleFormat'),
			youtubePlaylistId: extractYouTubePlaylistId(optionalString(data, 'youtubePlaylistId'))
		});
	},

	update: async (event) => {
		const { request } = event;
		const client = getConvexClientForEvent(event);
		const data = await request.formData();
		await client.mutation(api.events.upsert, {
			id: String(data.get('id')) as Id<'events'>,
			name: String(data.get('name')),
			editionTitle: optionalString(data, 'editionTitle'),
			eventType: eventType(data),
			year: Number(data.get('year')),
			titleFormat: optionalString(data, 'titleFormat'),
			youtubePlaylistId: extractYouTubePlaylistId(optionalString(data, 'youtubePlaylistId'))
		});
	},

	remove: async (event) => {
		const { request } = event;
		const client = getConvexClientForEvent(event);
		const data = await request.formData();
		await client.mutation(api.events.destroy, {
			id: String(data.get('id')) as Id<'events'>
		});
	},

	buildValidations: async (requestEvent) => {
		const { request, locals } = requestEvent;
		const data = await request.formData();
		const eventId = optionalString(data, 'eventId');

		if (!eventId) {
			return fail(400, {
				buildError: 'Choose an event before building validations.'
			});
		}

		const client = getConvexClientForEvent(requestEvent);
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
			const playlist = await syncPlaylistForEvent(client, event, accessToken);
			const assignments = await client.query(api.playlistAssignmentViews.getForEvent, {
				eventId: event._id
			});
			const aiChecks = await buildAiValidationCache(
				client,
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
