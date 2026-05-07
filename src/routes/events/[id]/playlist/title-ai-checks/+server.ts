import { json } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
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

	const result = await client.action(api.anthropicWorkflows.buildTitleAiChecks, {
		inputs
	});

	return json({
		validationsByVideoId: inputs.reduce<Record<string, VideoValidation[]>>(
			(validationsByVideoId, entry) => {
				const validation = result.validationsByInputKey[titleAiValidationInputKey(entry)];

				if (validation) {
					const responseVideoId = youtubeVideoIdByVideoId.get(entry.videoId) ?? entry.videoId;

					validationsByVideoId[responseVideoId] = [
						...(validationsByVideoId[responseVideoId] ?? []),
						validation
					];
				}

				return validationsByVideoId;
			},
			{}
		),
		error: result.error,
		cache: result.cache
	});
};
