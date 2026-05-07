import { error, json } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import { buildTitleAiValidationInputs, titleAiValidationInputKey } from '$lib/title-ai-validation';
import { api } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const client = getConvexClient();
	const routeTarget = await client.query(api.videoViews.getByRouteParam, {
		routeParam: params.id
	});
	const videoView = routeTarget?.videoView ?? null;

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

	const assignment = videoView.assignments[0];
	const speakers = videoView.speakers.map((speakerRow) => ({
		name: speakerRow.speaker.name,
		company: speakerRow.speaker.company,
		position: speakerRow.speaker.position
	}));
	const videoRecord = {
		speaker: speakers.map((speaker) => speaker.name).join(', ') || undefined,
		company:
			[
				...new Set(
					speakers
						.map((speaker) => speaker.company)
						.filter((value): value is string => Boolean(value))
				)
			].join(', ') || undefined,
		position:
			[
				...new Set(
					speakers
						.map((speaker) => speaker.position)
						.filter((value): value is string => Boolean(value))
				)
			].join(', ') || undefined,
		titleOverride: videoView.video.titleOverride,
		videoTitleFormat: videoView.video.videoTitleFormat,
		videoType: videoView.video.videoType
	};
	const inputs = buildTitleAiValidationInputs({
		videoId: videoView.video._id,
		title: videoView.video.title,
		...(assignment ? { event: assignment.event } : {}),
		speakers,
		video: videoRecord,
		disabledTitleValidationIds: videoView.video.disabledTitleValidationIds
	});
	const result = await client.action(api.videoWorkflows.buildTitleAiChecks, {
		inputs
	});

	return json({
		validations: inputs
			.map((input) => result.validationsByInputKey[titleAiValidationInputKey(input)])
			.filter(Boolean),
		error: result.error,
		cache: result.cache
	});
};
