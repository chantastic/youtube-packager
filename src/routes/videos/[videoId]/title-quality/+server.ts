import { error, json } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import { validateTitleAiChecksWithAnthropic } from '$lib/server/anthropic-title-validation';
import { planAiValidationCache, saveAiValidationCache } from '$lib/server/ai-validation-cache';
import { buildTitleAiValidationInputs } from '$lib/title-ai-validation';
import { api } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const videoView = await getConvexClient().query(api.videoView.getByYoutubeVideoId, {
		youtubeVideoId: params.videoId
	});

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
		videoId: videoView.video.youtubeVideoId,
		title: videoView.video.title,
		...(assignment ? { event: assignment.event } : {}),
		speakers,
		video: videoRecord
	});
	const cachePlan = await planAiValidationCache(inputs);
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

	return json({
		validations: cachePlan.entries
			.map(
				(entry) =>
					cachePlan.cachedValidationsByCacheKey[entry.cacheKeyString] ??
					freshResult.validationsByRequestId[entry.cacheKeyString]
			)
			.filter(Boolean),
		error: freshResult.error,
		cache: {
			hits: inputs.length - cachePlan.misses.length,
			misses: cachePlan.misses.length,
			writes: freshEntries.length
		}
	});
};
