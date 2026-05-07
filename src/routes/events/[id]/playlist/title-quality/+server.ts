import { json } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import { planAiValidationCache, saveAiValidationCache } from '$lib/server/ai-validation-cache';
import {
	buildTitleAiValidationInputs,
	titleAiValidationInputKey,
	type TitleAiValidationInput
} from '$lib/title-ai-validation';
import type { VideoValidation } from '$lib/video-validation';
import { api } from '../../../../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import type { RequestHandler } from './$types';

type AssignmentRow = FunctionReturnType<typeof api.playlistAssignmentViews.getForEvent>[number];
type EventRow = NonNullable<FunctionReturnType<typeof api.events.find>>;

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

export const POST: RequestHandler = async ({ params }) => {
	const client = getConvexClient();
	const event = await client.query(api.events.find, {
		id: params.id as Id<'events'>
	});

	if (!event) {
		return json(
			{
				validationsByVideoId: {},
				error: 'Event not found.'
			},
			{ status: 404 }
		);
	}

	const assignments = await client.query(api.playlistAssignmentViews.getForEvent, {
		eventId: event._id
	});
	const youtubeVideoIdByVideoId = new Map<string, string>(
		assignments.map((row) => [row.video._id, row.video.youtubeVideoId])
	);
	const inputs = titleAiInputsForAssignments(assignments, event);

	if (inputs.length === 0) {
		return json(
			{
				validationsByVideoId: {},
				error: 'No videos were found for validation.'
			},
			{ status: 400 }
		);
	}

	const cachePlan = await planAiValidationCache(inputs);
	const freshResult = await client.action(api.anthropicWorkflows.validateTitleAiChecks, {
		inputs: cachePlan.misses.map((entry) => ({
			requestId: entry.cacheKeyString,
			videoId: entry.videoId,
			field: entry.field,
			checkId: entry.checkId,
			label: entry.label,
			input: entry.input
		}))
	});
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

	return json({
		validationsByVideoId: cachePlan.entries.reduce<Record<string, VideoValidation[]>>(
			(result, entry) => {
				const validation =
					cachePlan.cachedValidationsByCacheKey[entry.cacheKeyString] ??
					freshResult.validationsByRequestId[entry.cacheKeyString];

				if (validation) {
					const responseVideoId = youtubeVideoIdByVideoId.get(entry.videoId) ?? entry.videoId;

					result[responseVideoId] = [...(result[responseVideoId] ?? []), validation];
				}

				return result;
			},
			{}
		),
		error: freshResult.error,
		cache: {
			hits: inputs.length - cachePlan.misses.length,
			misses: cachePlan.misses.length,
			writes: freshEntries.length
		}
	});
};
