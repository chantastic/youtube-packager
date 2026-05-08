import { error, json } from '@sveltejs/kit';
import { getConvexClientForEvent } from '$lib/server/convex';
import { titleAiValidationInputKey } from '$lib/title-ai-validation';
import { api } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	const client = getConvexClientForEvent(event);
	const routeTarget = await client.query(api.videoViews.getByRouteParam, {
		routeParam: params.id
	});
	const videoView = routeTarget?.videoView ?? null;

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

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
