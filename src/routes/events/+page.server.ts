import { fail, redirect } from '@sveltejs/kit';
import { extractYouTubePlaylistId } from '$lib/youtube';
import { getConvexClientForEvent } from '$lib/server/convex';
import { titleAiValidationInputKey, type TitleAiValidationInput } from '$lib/title-ai-validation';
import { isTitleCheckId } from '$lib/title-checks';
import { defaultEventType, isEventType } from '$lib/event-type';
import {
	pendingVideoValidation,
	summarizeVideoValidations,
	type VideoValidation
} from '$lib/video-validation';
import { api } from '../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel';
import type { PageServerLoad, Actions } from './$types';

type EventListItem = FunctionReturnType<typeof api.eventViews.getList>[number];
type EventVideoRow = EventListItem['videos'][number];
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

function enabledTitleValidationIds(data: FormData) {
	return data
		.getAll('enabledTitleValidationIds')
		.filter((value): value is string => typeof value === 'string')
		.filter(isTitleCheckId);
}

function titleAiInputsForEventItems(items: EventListItem[]) {
	const inputsByKey = new Map<string, TitleAiValidationInput>();

	for (const item of items) {
		for (const video of item.videos) {
			for (const input of video.titleAiInputs) {
				inputsByKey.set(titleAiValidationInputKey(input), input);
			}
		}
	}

	return [...inputsByKey.values()];
}

function cachedAiValidationsForVideo(
	video: EventVideoRow,
	cachedTitleAiChecks: CachedTitleAiChecks | null
) {
	return video.titleAiInputs.map((input) => {
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

export const load: PageServerLoad = async (event) => {
	const client = getConvexClientForEvent(event);
	const eventItems = await client.query(api.eventViews.getList);
	const events = eventItems.map((item) => item.event);
	const titleAiInputs = titleAiInputsForEventItems(eventItems);
	const aiCache =
		titleAiInputs.length > 0
			? await client.action(api.videoWorkflows.collectCachedTitleAiChecks, {
					inputs: titleAiInputs
				})
			: null;

	const validationStats = eventItems.flatMap((item) => {
		if (!item.event.youtubePlaylistId || !item.videos.length) {
			return [];
		}

		return [
			[
				item.event._id,
				summarizeVideoValidations(
					item.videos.map((video) => [
						...video.baselineValidations,
						...cachedAiValidationsForVideo(video, aiCache)
					])
				)
			] as const
		];
	});
	const validationBuildState: Array<readonly [Id<'events'>, ValidationBuildState]> = [];

	for (const item of eventItems) {
		if (!item.event.youtubePlaylistId) {
			continue;
		}

		if (!item.videos.length) {
			validationBuildState.push([
				item.event._id,
				{
					kind: 'playlist',
					label: 'Build validations'
				}
			]);
			continue;
		}

		const missingAiCount = item.videos
			.flatMap((video) => video.titleAiInputs)
			.filter((input) => !aiCache?.validationsByInputKey[titleAiValidationInputKey(input)]).length;

		if (missingAiCount === 0) {
			continue;
		}

		validationBuildState.push([
			item.event._id,
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
		const name = optionalString(data, 'name')?.trim();
		const year = Number(data.get('year'));

		if (!name || !Number.isFinite(year) || year < 1) {
			return fail(400, {
				createError: 'Event name and year are required.'
			});
		}

		const created = await client.mutation(api.events.upsert, {
			name,
			editionTitle: optionalString(data, 'editionTitle'),
			eventType: eventType(data),
			year,
			titleFormat: optionalString(data, 'titleFormat'),
			enabledTitleValidationIds: enabledTitleValidationIds(data),
			youtubePlaylistId: extractYouTubePlaylistId(optionalString(data, 'youtubePlaylistId'))
		});

		if (!created) {
			return fail(500, {
				createError: 'Event could not be created.'
			});
		}

		throw redirect(303, `/events/${created._id}`);
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
			enabledTitleValidationIds: enabledTitleValidationIds(data),
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
		const { request } = requestEvent;
		const data = await request.formData();
		const eventId = optionalString(data, 'eventId');

		if (!eventId) {
			return fail(400, {
				buildError: 'Choose an event before building validations.'
			});
		}

		const client = getConvexClientForEvent(requestEvent);
		const eventItem = await client.query(api.eventViews.getDetail, {
			eventId: eventId as Id<'events'>
		});

		if (!eventItem) {
			return fail(404, {
				buildEventId: eventId,
				buildError: 'Event not found.'
			});
		}

		const foundEvent = eventItem.event;

		if (!foundEvent?.youtubePlaylistId) {
			return fail(400, {
				buildEventId: eventId,
				buildError: 'Link a playlist before building validations.'
			});
		}

		const titleAiInputs = eventItem.videos.flatMap((video) => video.titleAiInputs);
		const cachedTitleAiChecks =
			titleAiInputs.length > 0
				? await client.action(api.videoWorkflows.collectCachedTitleAiChecks, {
						inputs: titleAiInputs
					})
				: null;
		const missingAiInputs = titleAiInputs.filter(
			(input) => !cachedTitleAiChecks?.validationsByInputKey[titleAiValidationInputKey(input)]
		);

		if (eventItem.videos.length > 0 && missingAiInputs.length > 0) {
			const aiChecks = await buildAiValidationCache(client, missingAiInputs);

			return {
				buildEventId: foundEvent._id,
				buildMessage: `Built AI title validations for ${aiChecks.checked}/${aiChecks.total}.`,
				buildWarning: aiChecks.error
			};
		}

		const result = await client.mutation(api.youtubeCommands.requestPlaylistSync, {
			eventId: foundEvent._id
		});

		if (result.error) {
			return fail(400, {
				buildEventId: eventId,
				buildError: result.error
			});
		}

		return {
			buildEventId: foundEvent._id,
			buildMessage: `Queued playlist sync for ${foundEvent.name}.`
		};
	}
};
