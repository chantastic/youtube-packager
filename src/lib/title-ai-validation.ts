import {
	getTitleHookParts,
	type TitleFormatEvent,
	type VideoTitleFormatRecord
} from './title-format';
import { titleAiCheckIds, titleCheckLabel, type TitleAiCheckId } from './title-checks';
import { youtubeTitleFocusLength, type VideoValidation } from './video-validation';

export type TitleAiValidationCheckId = TitleAiCheckId;
export type TitleAiValidationField = 'title';

export type TitleAiValidationInput = {
	videoId: string;
	field: TitleAiValidationField;
	checkId: TitleAiValidationCheckId;
	label: string;
	input: Record<string, unknown>;
};

export type TitleAiValidationContext = {
	videoId: string;
	title: string;
	event?: TitleFormatEvent;
	speakers?: Array<{
		name: string;
		company?: string;
		position?: string;
	}>;
	video?: VideoTitleFormatRecord;
};

export const titleAiValidationChecks = titleAiCheckIds.map((id) => ({
	id,
	label: titleCheckLabel(id)
})) satisfies Array<{
	id: TitleAiValidationCheckId;
	label: string;
}>;

export function titleAiValidationLabel(checkId: TitleAiValidationCheckId) {
	return titleCheckLabel(checkId);
}

export function buildTitleAiValidationInputs(
	context: TitleAiValidationContext
): TitleAiValidationInput[] {
	const mechanicsInput: TitleAiValidationInput = {
		videoId: context.videoId,
		field: 'title',
		checkId: 'mechanics',
		label: titleAiValidationLabel('mechanics'),
		input: {
			title: context.title
		}
	};

	if (!context.event) {
		return [mechanicsInput];
	}

	const hookParts = getTitleHookParts(
		context.title,
		context.event,
		context.video,
		youtubeTitleFocusLength
	);

	return [
		{
			videoId: context.videoId,
			field: 'title',
			checkId: 'hook',
			label: titleAiValidationLabel('hook'),
			input: {
				title: context.title,
				hookText: hookParts.focus,
				hookSource: hookParts.source,
				maxHookLength: youtubeTitleFocusLength,
				event: {
					name: context.event.name,
					editionTitle: context.event.editionTitle ?? null,
					year: context.event.year ?? null
				},
				video: {
					videoType: context.video?.videoType ?? null,
					videoTitleFormat: context.video?.videoTitleFormat ?? null
				},
				speakers: context.speakers ?? []
			}
		},
		mechanicsInput
	];
}

export function titleAiValidationInputKey(input: TitleAiValidationInput) {
	return `${input.videoId}:${input.field}:${input.checkId}:${JSON.stringify(input.input)}`;
}

export function validationsByCheckId(validations: VideoValidation[]) {
	return Object.fromEntries(validations.map((validation) => [validation.id, validation]));
}
