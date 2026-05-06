import { error, json } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import { validateTitleQualityWithAnthropic } from '$lib/server/anthropic-title-validation';
import { planTitleQualityCache, saveTitleQualityCache } from '$lib/server/title-quality-cache';
import { api } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const video = await getConvexClient().query(api.videos.getByYoutubeVideoId, {
		youtubeVideoId: params.videoId
	});

	if (!video) {
		throw error(404, 'Video not found.');
	}

	const titles = [
		{
			videoId: video.youtubeVideoId,
			title: video.title
		}
	];
	const cachePlan = await planTitleQualityCache(titles);
	const freshResult = await validateTitleQualityWithAnthropic(cachePlan.misses);
	const freshEntries = cachePlan.entries
		.filter((entry) => freshResult.validationsByVideoId[entry.videoId]?.length)
		.map((entry) => ({
			...entry.cacheKey,
			title: entry.title,
			validations: freshResult.validationsByVideoId[entry.videoId],
			checkedAt: Date.now()
		}));

	await saveTitleQualityCache(freshEntries);

	return json({
		validations: [
			...(cachePlan.cachedValidationsByVideoId[video.youtubeVideoId] ?? []),
			...(freshResult.validationsByVideoId[video.youtubeVideoId] ?? [])
		],
		error: freshResult.error,
		cache: {
			hits: titles.length - cachePlan.misses.length,
			misses: cachePlan.misses.length,
			writes: freshEntries.length
		}
	});
};
