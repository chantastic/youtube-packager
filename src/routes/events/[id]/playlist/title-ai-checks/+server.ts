import { json } from '@sveltejs/kit';
import { getConvexClientForEvent } from '$lib/server/convex';
import { titleAiValidationInputKey, type TitleAiValidationInput } from '$lib/title-ai-validation';
import type { VideoValidation } from '$lib/video-validation';
import { api } from '../../../../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import type { RequestHandler } from './$types';

type EventDetailItem = NonNullable<FunctionReturnType<typeof api.eventViews.getDetail>>;
type AssignmentRow = EventDetailItem['videos'][number];

function titleAiInputsForAssignments(assignments: AssignmentRow[]) {
	const inputsByKey = new Map<string, TitleAiValidationInput>();

	for (const row of assignments) {
		for (const input of row.titleAiInputs) {
			inputsByKey.set(titleAiValidationInputKey(input), input);
		}
	}

	return [...inputsByKey.values()];
}

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	const client = getConvexClientForEvent(event);
	const eventItem = await client.query(api.eventViews.getDetail, {
		eventId: params.id as Id<'events'>
	});

	if (!eventItem) {
		return json(
			{
				validationsByVideoId: {},
				error: 'Event not found.'
			},
			{ status: 404 }
		);
	}

	const assignments = eventItem.videos;
	const youtubeVideoIdByVideoId = new Map<string, string>(
		assignments.map((row) => [row.video._id, row.video.youtubeVideoId])
	);
	const inputs = titleAiInputsForAssignments(assignments);

	if (inputs.length === 0) {
		return json(
			{
				validationsByVideoId: {},
				error: 'No videos were found for validation.'
			},
			{ status: 400 }
		);
	}

	const result = await client.action(api.videoWorkflows.buildTitleAiChecks, {
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
