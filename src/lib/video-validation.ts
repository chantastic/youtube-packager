import {
	getTitleEventSuffix,
	normalizeTitleFormat,
	type TitleFormatEvent
} from './title-format';

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

type TitleFocusContext = {
	speakers?: Array<{
		name: string;
		company?: string;
	}>;
};

const weakTitleOpeners = [
	'introduction to',
	'intro to',
	'overview of',
	'panel',
	'talk',
	'session',
	'keynote',
	'presentation',
	'workshop',
	'fireside chat',
	'interview'
];

function normalizeComparable(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

function leadingComparable(value: string) {
	return normalizeComparable(value)
		.toLowerCase()
		.replace(/^[\s"'`“”‘’]+/, '');
}

function startsWithPhrase(value: string, phrase: string) {
	const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	return new RegExp(`^${escaped}(?:\\b|\\s*[:|\\-–—])`, 'i').test(value);
}

export function validateTitleEventSuffix(
	title: string,
	event: TitleFormatEvent
): VideoValidation {
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

export function validateTitleFocus(
	title: string,
	event: TitleFormatEvent,
	context: TitleFocusContext = {}
): VideoValidation {
	const focus = title.slice(0, youtubeTitleFocusLength);
	const normalizedFocus = normalizeComparable(focus);
	const leadingFocus = leadingComparable(focus);
	const eventName = leadingComparable(event.name);
	const eventYear = event.year?.toString();
	const speaker = context.speakers?.find((candidate) =>
		Boolean(candidate.name.trim()) && startsWithPhrase(leadingFocus, leadingComparable(candidate.name))
	);
	const company = context.speakers?.find((candidate) =>
		Boolean(candidate.company?.trim()) &&
		startsWithPhrase(leadingFocus, leadingComparable(candidate.company ?? ''))
	);
	const startsWithEventName = Boolean(eventName && startsWithPhrase(leadingFocus, eventName));
	const startsWithEventYear = Boolean(eventYear && leadingFocus.startsWith(eventYear));
	const weakOpener = weakTitleOpeners.find((opener) => startsWithPhrase(leadingFocus, opener));

	if (!normalizedFocus) {
		return {
			id: 'title-focus',
			label: 'First 55',
			status: 'fail',
			message: 'Missing title hook',
			expected: `Clear topic or hook in the first ${youtubeTitleFocusLength} characters`
		};
	}

	if (startsWithEventName || startsWithEventYear) {
		return {
			id: 'title-focus',
			label: 'First 55',
			status: 'fail',
			message: 'Starts with event metadata',
			expected: `Clear topic or hook in the first ${youtubeTitleFocusLength} characters`,
			details: ['Lead with the video topic, then keep event naming in the suffix.']
		};
	}

	if (speaker || company) {
		return {
			id: 'title-focus',
			label: 'First 55',
			status: 'fail',
			message: speaker ? 'Starts with speaker metadata' : 'Starts with company metadata',
			expected: `Clear topic or hook in the first ${youtubeTitleFocusLength} characters`,
			details: ['Lead with the video topic, then put speaker and company metadata later.']
		};
	}

	if (weakOpener) {
		return {
			id: 'title-focus',
			label: 'First 55',
			status: 'fail',
			message: 'Starts with weak framing',
			expected: `Clear topic or hook in the first ${youtubeTitleFocusLength} characters`,
			details: [`"${weakOpener}" uses prime title space before the concrete topic.`]
		};
	}

	return {
		id: 'title-focus',
		label: 'First 55',
		status: 'pass',
		message: 'Hook is front-loaded',
		expected: `Clear topic or hook in the first ${youtubeTitleFocusLength} characters`
	};
}

export function validateVideoBaseline(
	title: string,
	event: TitleFormatEvent,
	context: TitleFocusContext = {}
): VideoValidation[] {
	return [
		validateTitleEventSuffix(title, event),
		validateTitleFocus(title, event, context)
	];
}

export function videoValidationContextKey(event: TitleFormatEvent) {
	return JSON.stringify({
		name: event.name,
		editionTitle: event.editionTitle ?? null,
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
