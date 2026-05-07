import { error, json } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import {
	buildTitleAlternativesInput,
	prepareTitleAlternativesValidationContext
} from '$lib/server/title-alternatives-context';
import { titleAiValidationInputKey } from '$lib/title-ai-validation';
import type { VideoValidation } from '$lib/video-validation';
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

	const validationContext = prepareTitleAlternativesValidationContext(videoView);
	const aiValidationsByInputKey = new Map<string, VideoValidation>();

	if (validationContext.aiInputsByKey.size > 0) {
		const titleAiChecks = await client.action(api.videoWorkflows.buildTitleAiChecks, {
			inputs: [...validationContext.aiInputsByKey.values()]
		});

		for (const entry of validationContext.aiInputsByKey.values()) {
			const validation = titleAiChecks.validationsByInputKey[titleAiValidationInputKey(entry)];

			if (validation) {
				aiValidationsByInputKey.set(titleAiValidationInputKey(entry), validation);
			}
		}
	}

	const result = await client.action(api.videoWorkflows.generateTitleAlternatives, {
		input: buildTitleAlternativesInput(videoView, validationContext, aiValidationsByInputKey)
	});

	return json(result);
};
