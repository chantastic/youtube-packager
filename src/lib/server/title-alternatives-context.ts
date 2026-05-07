import type { TitleAlternativesInput } from '$lib/title-alternatives';
import {
	buildTitleAiValidationInputs,
	titleAiValidationInputKey,
	type TitleAiValidationInput
} from '$lib/title-ai-validation';
import type { TitleFormatEvent, VideoTitleFormatRecord } from '$lib/title-format';
import { validateVideoBaseline, type VideoValidation } from '$lib/video-validation';

export type TitleAlternativesVideoView = {
	video: {
		_id: string;
		youtubeVideoId: string;
		title: string;
		description?: string;
		channelTitle?: string;
		publishedAt?: string;
		videoPublishedAt?: string;
		titleOverride?: string;
		disabledTitleValidationIds?: string[];
		videoTitleFormat?: string;
		videoType?: VideoTitleFormatRecord['videoType'];
	};
	speakers: Array<{
		speaker: {
			name: string;
			company?: string;
			position?: string;
		};
	}>;
	assignments: Array<{
		assignment: {
			_id: string;
		};
		event: TitleFormatEvent;
	}>;
};

export type TitleAlternativesValidationContext = {
	videoRecord: VideoTitleFormatRecord;
	speakerContext: Array<{
		name: string;
		company?: string;
		position?: string;
	}>;
	validationSpeakers: Array<{
		name: string;
		company?: string;
		position?: string;
	}>;
	aiInputsByKey: Map<string, TitleAiValidationInput>;
	aiInputKeysByAssignmentId: Map<string, string[]>;
};

function uniquePresent(values: Array<string | undefined>) {
	return [...new Set(values.filter((value): value is string => Boolean(value)))].join(', ');
}

function validationSpeakerRecords(
	speakers: Array<{ name: string; company?: string; position?: string }>
) {
	return speakers.map((speaker) => ({
		name: speaker.name,
		company: speaker.company,
		position: speaker.position
	}));
}

export function prepareTitleAlternativesValidationContext(
	videoView: TitleAlternativesVideoView
): TitleAlternativesValidationContext {
	const speakerNames = videoView.speakers.map((row) => row.speaker.name).join(', ');
	const speakerContext = videoView.speakers.map((row) => ({
		name: row.speaker.name,
		company: row.speaker.company,
		position: row.speaker.position
	}));
	const videoRecord: VideoTitleFormatRecord = {
		speaker: speakerNames || undefined,
		company: uniquePresent(videoView.speakers.map((row) => row.speaker.company)) || undefined,
		position: uniquePresent(videoView.speakers.map((row) => row.speaker.position)) || undefined,
		titleOverride: videoView.video.titleOverride,
		videoTitleFormat: videoView.video.videoTitleFormat,
		videoType: videoView.video.videoType
	};
	const validationSpeakers = validationSpeakerRecords(speakerContext);
	const aiInputsByKey = new Map<string, TitleAiValidationInput>();
	const aiInputKeysByAssignmentId = new Map<string, string[]>();

	for (const row of videoView.assignments) {
		const inputs = buildTitleAiValidationInputs({
			videoId: videoView.video._id,
			title: videoView.video.title,
			event: row.event,
			speakers: validationSpeakers,
			video: videoRecord,
			disabledTitleValidationIds: videoView.video.disabledTitleValidationIds
		});
		const inputKeys = inputs.map(titleAiValidationInputKey);

		aiInputKeysByAssignmentId.set(row.assignment._id, inputKeys);

		for (const input of inputs) {
			aiInputsByKey.set(titleAiValidationInputKey(input), input);
		}
	}

	return {
		videoRecord,
		speakerContext,
		validationSpeakers,
		aiInputsByKey,
		aiInputKeysByAssignmentId
	};
}

export function buildTitleAlternativesInput(
	videoView: TitleAlternativesVideoView,
	context: TitleAlternativesValidationContext,
	aiValidationsByInputKey: Map<string, VideoValidation>
): TitleAlternativesInput {
	return {
		currentTitle: videoView.video.title,
		description: videoView.video.description,
		video: context.videoRecord,
		videoContext: {
			youtubeVideoId: videoView.video.youtubeVideoId,
			title: videoView.video.title,
			description: videoView.video.description,
			channelTitle: videoView.video.channelTitle,
			publishedAt: videoView.video.publishedAt,
			videoPublishedAt: videoView.video.videoPublishedAt,
			speakers: context.speakerContext
		},
		assignments: videoView.assignments.map((row) => ({
			assignmentId: row.assignment._id,
			event: row.event,
			titleValidations: [
				...validateVideoBaseline(videoView.video.title, row.event, {
					speakers: context.validationSpeakers,
					video: context.videoRecord,
					disabledTitleValidationIds: videoView.video.disabledTitleValidationIds
				}),
				...(context.aiInputKeysByAssignmentId.get(row.assignment._id) ?? [])
					.map((inputKey) => aiValidationsByInputKey.get(inputKey))
					.filter((validation): validation is VideoValidation => Boolean(validation))
			]
		}))
	};
}
