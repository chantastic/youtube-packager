import { json } from '@sveltejs/kit';
import { getConvexClientForEvent } from '$lib/server/convex';
import { resolveVideoView } from '$lib/server/video-view';
import { titleAiValidationInputKey } from '$lib/title-ai-validation';
import { api } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	const client = getConvexClientForEvent(event);
	const videoView = await resolveVideoView(client, params.id);

	const inputs = videoView.titleAiInputs;
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
