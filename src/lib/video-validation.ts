import {
	formatComposedVideoTitle,
	getComposedTitleFormatAffixes,
	getTitleEventSuffix,
	normalizeTitleOverride,
	normalizeTitleFormat,
	type TitleFormatEvent,
	type VideoTitleFormatRecord
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

type VideoBaselineContext = TitleFocusContext & {
	video?: VideoTitleFormatRecord;
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

export function validateSelectedTitleFormat(
	title: string,
	event: TitleFormatEvent,
	video: VideoTitleFormatRecord
): VideoValidation {
	const titleOverride = normalizeTitleOverride(video.titleOverride);

	if (titleOverride) {
		return validateTitleOverride(title, video);
	}

	const { prefix, suffix } = getComposedTitleFormatAffixes(video, event);

	if (!prefix && !suffix) {
		return {
			id: 'title-format',
			label: 'Title format',
			status: 'info',
			message: 'No format affixes configured'
		};
	}

	const normalizedTitle = normalizeComparable(title);
	const hasExpectedPrefix = !prefix || normalizedTitle.startsWith(prefix);
	const hasExpectedSuffix = !suffix || normalizedTitle.endsWith(suffix);
	const missing = [
		prefix && !hasExpectedPrefix ? `Start with "${prefix}".` : null,
		suffix && !hasExpectedSuffix ? `End with "${suffix}".` : null
	].filter((message): message is string => Boolean(message));

	return {
		id: 'title-format',
		label: 'Title format',
		status: hasExpectedPrefix && hasExpectedSuffix ? 'pass' : 'fail',
		message:
			hasExpectedPrefix && hasExpectedSuffix
				? 'Matches selected format'
				: 'Does not match selected format',
		expected: formatComposedVideoTitle('Video Title', video, event),
		...(missing.length ? { details: missing } : {})
	};
}

export function validateTitleOverride(
	title: string,
	video: VideoTitleFormatRecord
): VideoValidation {
	const titleOverride = normalizeTitleOverride(video.titleOverride);

	if (!titleOverride) {
		return {
			id: 'title-override',
			label: 'Title override',
			status: 'info',
			message: 'No override configured'
		};
	}

	const matchesOverride = normalizeComparable(title) === normalizeComparable(titleOverride);

	return {
		id: 'title-override',
		label: 'Title override',
		status: matchesOverride ? 'pass' : 'fail',
		message: matchesOverride ? 'Matches override' : 'Does not match override',
		expected: titleOverride
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
	const speaker = context.speakers?.find(
		(candidate) =>
			Boolean(candidate.name.trim()) &&
			startsWithPhrase(leadingFocus, leadingComparable(candidate.name))
	);
	const company = context.speakers?.find(
		(candidate) =>
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
	context: VideoBaselineContext = {}
): VideoValidation[] {
	if (context.video && normalizeTitleOverride(context.video.titleOverride)) {
		return [validateTitleOverride(title, context.video), validateTitleFocus(title, event, context)];
	}

	return [
		validateTitleEventSuffix(title, event),
		...(context.video ? [validateSelectedTitleFormat(title, event, context.video)] : []),
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
