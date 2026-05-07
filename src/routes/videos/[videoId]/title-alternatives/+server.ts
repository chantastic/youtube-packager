import { error, json } from '@sveltejs/kit';
import { planAiValidationCache, saveAiValidationCache } from '$lib/server/ai-validation-cache';
import { generateTitleAlternativesWithAnthropic } from '$lib/server/anthropic-title-alternatives';
import { validateTitleAiChecksWithAnthropic } from '$lib/server/anthropic-title-validation';
import { getConvexClient } from '$lib/server/convex';
import {
	buildTitleAiValidationInputs,
	titleAiValidationInputKey,
	type TitleAiValidationInput
} from '$lib/title-ai-validation';
import type { VideoTitleFormatRecord } from '$lib/title-format';
import { validateVideoBaseline, type VideoValidation } from '$lib/video-validation';
import { api } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

function validationSpeakerRecords(
	speakers: Array<{ name: string; company?: string; position?: string }>
) {
	return speakers.map((speaker) => ({
		name: speaker.name,
		company: speaker.company,
		position: speaker.position
	}));
}

export const POST: RequestHandler = async ({ params }) => {
	const videoView = await getConvexClient().query(api.videoView.getByYoutubeVideoId, {
		youtubeVideoId: params.videoId
	});

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

	const speakerNames = videoView.speakers.map((row) => row.speaker.name).join(', ');
	const speakers = videoView.speakers.map((row) => ({
		name: row.speaker.name,
		company: row.speaker.company,
		position: row.speaker.position
	}));
	const companies = [
		...new Set(
			videoView.speakers
				.map((row) => row.speaker.company)
				.filter((company): company is string => Boolean(company))
		)
	].join(', ');
	const positions = [
		...new Set(
			videoView.speakers
				.map((row) => row.speaker.position)
				.filter((position): position is string => Boolean(position))
		)
	].join(', ');
	const videoRecord: VideoTitleFormatRecord = {
		speaker: speakerNames || undefined,
		company: companies || undefined,
		position: positions || undefined,
		titleOverride: videoView.video.titleOverride,
		videoTitleFormat: videoView.video.videoTitleFormat,
		videoType: videoView.video.videoType
	};
	const validationSpeakers = validationSpeakerRecords(speakers);
	const aiInputsByKey = new Map<string, TitleAiValidationInput>();
	const aiInputKeysByAssignmentId = new Map<string, string[]>();

	for (const row of videoView.assignments) {
		const inputs = buildTitleAiValidationInputs({
			videoId: videoView.video.youtubeVideoId,
			title: videoView.video.title,
			event: row.event,
			speakers: validationSpeakers,
			video: videoRecord
		});
		const inputKeys = inputs.map(titleAiValidationInputKey);

		aiInputKeysByAssignmentId.set(row.assignment._id, inputKeys);

		for (const input of inputs) {
			aiInputsByKey.set(titleAiValidationInputKey(input), input);
		}
	}

	const aiValidationsByInputKey = new Map<string, VideoValidation>();

	if (aiInputsByKey.size > 0) {
		const cachePlan = await planAiValidationCache([...aiInputsByKey.values()]);
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

	const result = await generateTitleAlternativesWithAnthropic({
		currentTitle: videoView.video.title,
		description: videoView.video.description,
		video: videoRecord,
		videoContext: {
			youtubeVideoId: videoView.video.youtubeVideoId,
			title: videoView.video.title,
			description: videoView.video.description,
			channelTitle: videoView.video.channelTitle,
			publishedAt: videoView.video.publishedAt,
			videoPublishedAt: videoView.video.videoPublishedAt,
			speakers
		},
		assignments: videoView.assignments.map((row) => ({
			assignmentId: row.assignment._id,
			event: row.event,
			titleValidations: [
				...validateVideoBaseline(videoView.video.title, row.event, {
					speakers: validationSpeakers,
					video: videoRecord
				}),
				...(aiInputKeysByAssignmentId.get(row.assignment._id) ?? [])
					.map((inputKey) => aiValidationsByInputKey.get(inputKey))
					.filter((validation): validation is VideoValidation => Boolean(validation))
			]
		}))
	});

	return json(result);
};
