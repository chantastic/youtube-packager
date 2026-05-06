import { getTitleEventSuffix, type TitleFormatEvent } from './title-format';

export type ValidationStatus = 'pass' | 'fail' | 'info';

export const youtubeTitleFocusLength = 55;

export type VideoValidation = {
	id: string;
	label: string;
	status: ValidationStatus;
	message: string;
	expected?: string;
	details?: string[];
	suggested?: string;
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
