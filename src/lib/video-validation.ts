import { getTitleEventSuffix, normalizeTitleFormat, type TitleFormatEvent } from './title-format';

export type ValidationStatus = 'pass' | 'fail' | 'info';

export const youtubeTitleFocusLength = 55;
export const youtubeTitleMaxLength = 100;

export type VideoValidation = {
	id: string;
	label: string;
	status: ValidationStatus;
	message: string;
	expected?: string;
	details?: string[];
	suggested?: string;
};

export type VideoValidationStat = {
	id: string;
	label: string;
	passCount: number;
	failCount: number;
	infoCount: number;
};

function normalizeComparable(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

export function validateTitleEventSuffix(title: string, event: TitleFormatEvent): VideoValidation {
	const suffix = getTitleEventSuffix(event.titleFormat, event);

	if (!suffix) {
		return {
			id: 'title-event-suffix',
			label: 'Title suffix',
			status: 'info',
			message: 'No event suffix configured'
		};
	}

	const titleIncludesSuffix = normalizeComparable(title).includes(suffix);

	return {
		id: 'title-event-suffix',
		label: 'Title suffix',
		status: titleIncludesSuffix ? 'pass' : 'fail',
		message: titleIncludesSuffix ? 'Includes event suffix' : 'Missing event suffix',
		expected: suffix
	};
}

export function validateVideoBaseline(title: string, event: TitleFormatEvent): VideoValidation[] {
	return [validateTitleEventSuffix(title, event)];
}

export function videoValidationContextKey(event: TitleFormatEvent) {
	return JSON.stringify({
		name: event.name,
		year: event.year ?? null,
		titleFormat: normalizeTitleFormat(event.titleFormat)
	});
}

export function summarizeVideoValidations(validationsByVideo: VideoValidation[][]) {
	const byId = new Map<string, VideoValidationStat>();

	for (const validations of validationsByVideo) {
		for (const validation of validations) {
			const existing = byId.get(validation.id) ?? {
				id: validation.id,
				label: validation.label,
				passCount: 0,
				failCount: 0,
				infoCount: 0
			};

			if (validation.status === 'pass') {
				existing.passCount += 1;
			} else if (validation.status === 'fail') {
				existing.failCount += 1;
			} else {
				existing.infoCount += 1;
			}

			byId.set(validation.id, existing);
		}
	}

	return [...byId.values()];
}
