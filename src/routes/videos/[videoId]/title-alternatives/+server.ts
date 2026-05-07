import { error, json } from '@sveltejs/kit';
import { planAiValidationCache, saveAiValidationCache } from '$lib/server/ai-validation-cache';
import { generateTitleAlternativesWithAnthropic } from '$lib/server/anthropic-title-alternatives';
import { validateTitleAiChecksWithAnthropic } from '$lib/server/anthropic-title-validation';
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
	const videoView = await getConvexClient().query(api.videoView.getByYoutubeVideoId, {
		youtubeVideoId: params.videoId
	});

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

	const validationContext = prepareTitleAlternativesValidationContext(videoView);
	const aiValidationsByInputKey = new Map<string, VideoValidation>();

	if (validationContext.aiInputsByKey.size > 0) {
		const cachePlan = await planAiValidationCache([...validationContext.aiInputsByKey.values()]);
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

		for (const entry of cachePlan.entries) {
			const validation =
				cachePlan.cachedValidationsByCacheKey[entry.cacheKeyString] ??
				freshResult.validationsByRequestId[entry.cacheKeyString];

			if (validation) {
				aiValidationsByInputKey.set(titleAiValidationInputKey(entry), validation);
			}
		}
	}

	const result = await generateTitleAlternativesWithAnthropic(
		buildTitleAlternativesInput(videoView, validationContext, aiValidationsByInputKey)
	);

	return json(result);
};
