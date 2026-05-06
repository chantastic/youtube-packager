import { json } from '@sveltejs/kit';
import { validateTitleQualityWithAnthropic } from '$lib/server/anthropic-title-validation';
import { planTitleQualityCache, saveTitleQualityCache } from '$lib/server/title-quality-cache';
import type { RequestHandler } from './$types';

type TitleQualityRequestBody = {
	titles?: Array<{
		videoId?: unknown;
		title?: unknown;
	}>;
};

function normalizeTitles(body: TitleQualityRequestBody) {
	return (body.titles ?? [])
		.map((title) => ({
			videoId: typeof title.videoId === 'string' ? title.videoId : '',
			title: typeof title.title === 'string' ? title.title : ''
		}))
		.filter((title) => title.videoId && title.title);
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as TitleQualityRequestBody;
	const titles = normalizeTitles(body);

	if (titles.length === 0) {
		return json(
			{
				validationsByVideoId: {},
				error: 'No titles were provided for validation.'
			},
			{ status: 400 }
		);
	}

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
		validationsByVideoId: {
			...cachePlan.cachedValidationsByVideoId,
			...freshResult.validationsByVideoId
		},
		error: freshResult.error,
		cache: {
			hits: titles.length - cachePlan.misses.length,
			misses: cachePlan.misses.length,
			writes: freshEntries.length
		}
	});
};
