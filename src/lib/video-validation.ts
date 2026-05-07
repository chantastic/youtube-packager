import {
	formatComposedVideoTitle,
	getComposedTitleFormatAffixes,
	getTitleEventSuffix,
	normalizeTitleOverride,
	normalizeTitleFormat,
	normalizeVideoType,
	type TitleFormatEvent,
	type VideoTitleFormatRecord
} from './title-format';

export type ValidationStatus = 'pass' | 'fail' | 'info' | 'pending';

export const youtubeTitleFocusLength = 55;
export const youtubeTitleMaxLength = 100;
export const videoValidationVersion = '2026-05-06.3';

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
	pendingCount: number;
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
	'workshop',
	'fireside chat',
	'interview'
];
const validationOrder = ['hook', 'profile', 'event', 'format', 'mechanics'];

function normalizeComparable(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

function comparableIncludes(value: string, expected: string) {
	const normalizedValue = normalizeComparable(value).toLowerCase();
	const normalizedExpected = normalizeComparable(expected).toLowerCase();

	return Boolean(normalizedExpected) && normalizedValue.includes(normalizedExpected);
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
			id: 'event',
			label: 'Event',
			status: 'info',
			message: 'No event suffix configured'
		};
	}

	const titleIncludesSuffix = normalizeComparable(title).includes(suffix);

	return {
		id: 'event',
		label: 'Event',
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
	const { prefix, suffix } = getComposedTitleFormatAffixes(video, event);

	if (!prefix && !suffix) {
		return {
			id: 'format',
			label: 'Format',
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
		id: 'format',
		label: 'Format',
		status: hasExpectedPrefix && hasExpectedSuffix ? 'pass' : 'fail',
		message:
			hasExpectedPrefix && hasExpectedSuffix
				? 'Matches selected format'
				: 'Does not match selected format',
		expected: formatComposedVideoTitle('Video Title', video, event),
		...(missing.length ? { details: missing } : {})
	};
}

export function validateTitleProfile(
	title: string,
	context: VideoBaselineContext = {}
): VideoValidation | null {
	const videoType = normalizeVideoType(context.video?.videoType);

	if (!context.video || videoType === 'panelDiscussion' || videoType === 'custom') {
		return null;
	}

	const speakers = context.speakers?.filter((speaker) => speaker.name.trim()) ?? [];
	const companies = [
		...new Set(
			speakers
				.map((speaker) => speaker.company)
				.filter((company): company is string => Boolean(company?.trim()))
		)
	];
	const missingMetadata = [
		speakers.length === 0 ? 'presenter' : null,
		companies.length === 0 ? 'company' : null
	].filter((item): item is string => Boolean(item));

	if (missingMetadata.length) {
		return {
			id: 'profile',
			label: 'Profile',
			status: 'fail',
			message: `Missing ${missingMetadata.join(' and ')}`,
			expected: 'Presenter and company'
		};
	}

	const missingFromTitle = [
		...speakers
			.filter((speaker) => !comparableIncludes(title, speaker.name))
			.map((speaker) => speaker.name),
		...companies.filter((company) => !comparableIncludes(title, company))
	];

	return {
		id: 'profile',
		label: 'Profile',
		status: missingFromTitle.length ? 'fail' : 'pass',
		message: missingFromTitle.length
			? 'Missing presenter or company'
			: 'Includes presenter and company',
		expected: 'Presenter and company in title',
		...(missingFromTitle.length
			? { details: [`Missing from title: ${missingFromTitle.join(', ')}.`] }
			: {})
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
			id: 'hook',
			label: 'Hook',
			status: 'fail',
			message: 'Missing title hook',
			expected: `Clear topic or hook in the first ${youtubeTitleFocusLength} characters`
		};
	}

	if (startsWithEventName || startsWithEventYear) {
		return {
			id: 'hook',
			label: 'Hook',
			status: 'fail',
			message: 'Starts with event metadata',
			expected: `Clear topic or hook in the first ${youtubeTitleFocusLength} characters`,
			details: ['Lead with the video topic, then keep event naming in the suffix.']
		};
	}

	if (speaker || company) {
		return {
			id: 'hook',
			label: 'Hook',
			status: 'fail',
			message: speaker ? 'Starts with speaker metadata' : 'Starts with company metadata',
			expected: `Clear topic or hook in the first ${youtubeTitleFocusLength} characters`,
			details: ['Lead with the video topic, then put speaker and company metadata later.']
		};
	}

	if (weakOpener) {
		return {
			id: 'hook',
			label: 'Hook',
			status: 'fail',
			message: 'Starts with weak framing',
			expected: `Clear topic or hook in the first ${youtubeTitleFocusLength} characters`,
			details: [`"${weakOpener}" uses prime title space before the concrete topic.`]
		};
	}

	return {
		id: 'hook',
		label: 'Hook',
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
		return [];
	}

	const profileValidation = validateTitleProfile(title, context);

	return [
		...(profileValidation ? [profileValidation] : []),
		validateTitleEventSuffix(title, event),
		...(context.video ? [validateSelectedTitleFormat(title, event, context.video)] : [])
	];
}

export function pendingVideoValidation(id: string, label: string): VideoValidation {
	return {
		id,
		label,
		status: 'pending',
		message: 'Not checked yet'
	};
}

export function videoValidationContextKey(event: TitleFormatEvent) {
	return JSON.stringify({
		version: videoValidationVersion,
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
				infoCount: 0,
				pendingCount: 0
			};

			if (validation.status === 'pass') {
				existing.passCount += 1;
			} else if (validation.status === 'fail') {
				existing.failCount += 1;
			} else if (validation.status === 'pending') {
				existing.pendingCount += 1;
			} else {
				existing.infoCount += 1;
			}

			byId.set(validation.id, existing);
		}
	}

	return [...byId.values()].sort((a, b) => {
		const aIndex = validationOrder.indexOf(a.id);
		const bIndex = validationOrder.indexOf(b.id);
		const normalizedAIndex = aIndex === -1 ? validationOrder.length : aIndex;
		const normalizedBIndex = bIndex === -1 ? validationOrder.length : bIndex;

		return normalizedAIndex - normalizedBIndex;
	});
}
