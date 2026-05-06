export type TitleFormatEvent = {
	name: string;
	editionTitle?: string;
	year?: number;
	titleFormat?: string;
};

export type VideoTitleFormatRecord = {
	speaker?: string;
	company?: string;
	position?: string;
	titleOverride?: string;
	videoTitleFormat?: string;
	videoType?: VideoType;
};

export type VideoType =
	| 'talk'
	| 'presentation'
	| 'panelDiscussion'
	| 'keynote'
	| 'demo'
	| 'interview'
	| 'custom';

const titlePlaceholder = '__YTP_TITLE__';

export const defaultTitleFormat = '{title} | {event_name} {year}';
export const titleTokens = ['{title}', '{event_name}', '{edition_title}', '{year}'];
export const defaultVideoTitleFormat = '{title} — {speaker}, {company}';
export const defaultVideoType: VideoType = 'talk';
export const defaultComposedVideoTitleFormat = '{title} — {speaker}, {company} {event_suffix}';
export const videoTitleTokens = [
	'{title}',
	'{speaker}',
	'{company}',
	'{position}',
	'{video_type}',
	'{event_suffix}',
	'{event_name}',
	'{edition_title}',
	'{year}'
];

export const videoTypeOptions = [
	{
		value: 'talk',
		label: 'Talk',
		defaultTitleFormat: defaultVideoTitleFormat,
		defaultComposedTitleFormat: defaultComposedVideoTitleFormat
	},
	{
		value: 'panelDiscussion',
		label: 'Panel Discussion',
		defaultTitleFormat: '{title} — {video_type}',
		defaultComposedTitleFormat: '{title} — Panel Discussion {event_suffix}'
	},
	{
		value: 'keynote',
		label: 'Keynote',
		defaultTitleFormat: defaultVideoTitleFormat,
		defaultComposedTitleFormat: '{title} — {speaker}, {company} {event_suffix} {video_type}'
	},
	{
		value: 'interview',
		label: 'Interview',
		defaultTitleFormat: defaultVideoTitleFormat,
		defaultComposedTitleFormat: defaultComposedVideoTitleFormat
	},
	{
		value: 'custom',
		label: 'Custom',
		defaultTitleFormat: defaultVideoTitleFormat,
		defaultComposedTitleFormat: defaultComposedVideoTitleFormat
	}
] as const satisfies ReadonlyArray<{
	value: VideoType;
	label: string;
	defaultTitleFormat: string;
	defaultComposedTitleFormat?: string;
}>;

const legacyVideoTypeAliases: Partial<Record<VideoType, VideoType>> = {
	presentation: 'talk',
	demo: 'talk'
};
const videoTypeValues = new Set<VideoType>([
	...videoTypeOptions.map((option) => option.value),
	'presentation',
	'demo'
]);

function normalizeSpaces(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

function cleanupTitlePunctuation(value: string) {
	return normalizeSpaces(value)
		.replace(/\s+,\s+/g, ', ')
		.replace(/\s+,\s*$/g, '')
		.replace(/,\s*$/g, '')
		.replace(/,\s+([|—-])/g, ' $1')
		.replace(/([|—-])\s*,\s+/g, '$1 ')
		.replace(/\s+[—-]\s+([|])/g, ' $1')
		.replace(/\s+[—|-]\s*$/g, '')
		.replace(/^\s*[—|-]\s+/g, '')
		.trim();
}

function formatWithTitle(format: string, title: string, event: TitleFormatEvent) {
	return format
		.replace(/{title}/g, title)
		.replace(/{event_name}/g, event.name || 'Event Name')
		.replace(/{edition_title}/g, event.editionTitle ?? '')
		.replace(/{year}/g, String(event.year ?? ''));
}

function formatWithEventMetadata(
	format: string,
	title: string,
	event: TitleFormatEvent,
	eventSuffix: string
) {
	return formatWithTitle(format, title, event).replace(/{event_suffix}/g, eventSuffix);
}

function formatWithVideoTitle(format: string, title: string, video: VideoTitleFormatRecord) {
	const videoType = normalizeVideoType(video.videoType);
	const videoTypeLabel = videoTypeLabelFor(videoType);
	const speaker = videoType === 'panelDiscussion' ? videoTypeLabel : (video.speaker ?? '');
	const company = videoType === 'panelDiscussion' ? '' : (video.company ?? '');

	return format
		.replace(/{title}/g, title)
		.replace(/{speaker}/g, speaker)
		.replace(/{company}/g, company)
		.replace(/{position}/g, video.position ?? '')
		.replace(/{video_type}/g, videoTypeLabel);
}

function formatWithComposedTitle(
	format: string,
	title: string,
	video: VideoTitleFormatRecord,
	event: TitleFormatEvent
) {
	return formatWithEventMetadata(
		formatWithVideoTitle(format, title, video),
		title,
		event,
		getTitleEventSuffix(event.titleFormat, event)
	);
}

export function normalizeTitleFormat(format?: string) {
	const normalized = format?.trim();
	return normalized && normalized.includes('{title}') ? normalized : defaultTitleFormat;
}

export function normalizeTitleOverride(value?: string) {
	const normalized = value?.trim();

	return normalized ? cleanupTitlePunctuation(normalized) : undefined;
}

export function isVideoType(value: unknown): value is VideoType {
	return typeof value === 'string' && videoTypeValues.has(value as VideoType);
}

export function normalizeVideoType(value: unknown): VideoType {
	if (!isVideoType(value)) {
		return defaultVideoType;
	}

	return legacyVideoTypeAliases[value] ?? value;
}

export function canCustomizeVideoTitleFormat(value: unknown) {
	return normalizeVideoType(value) === 'custom';
}

export function videoTypeLabelFor(value: unknown) {
	const videoType = normalizeVideoType(value);

	return videoTypeOptions.find((option) => option.value === videoType)?.label ?? 'Talk';
}

function videoTypeOptionFor(value: unknown) {
	const videoType = normalizeVideoType(value);

	return videoTypeOptions.find((option) => option.value === videoType);
}

export function getDefaultVideoTitleFormat(videoType?: VideoType) {
	const normalizedType = normalizeVideoType(videoType);

	return (
		videoTypeOptionFor(normalizedType)?.defaultTitleFormat ?? defaultVideoTitleFormat
	);
}

export function getDefaultComposedVideoTitleFormat(videoType?: VideoType) {
	const option = videoTypeOptionFor(videoType);

	return option && 'defaultComposedTitleFormat' in option
		? option.defaultComposedTitleFormat
		: undefined;
}

export function getDefaultVideoTypeTitleFormat(videoType?: VideoType) {
	return getDefaultComposedVideoTitleFormat(videoType) ?? getDefaultVideoTitleFormat(videoType);
}

export function normalizeVideoTitleFormat(format?: string, videoType?: VideoType) {
	const normalizedType = normalizeVideoType(videoType);
	const normalized = format?.trim();
	return canCustomizeVideoTitleFormat(normalizedType) && normalized && normalized.includes('{title}')
		? normalized
		: getDefaultVideoTitleFormat(normalizedType);
}

export function normalizeComposedVideoTitleFormat(format?: string, videoType?: VideoType) {
	const normalizedType = normalizeVideoType(videoType);
	const normalized = format?.trim();

	return canCustomizeVideoTitleFormat(normalizedType) && normalized && normalized.includes('{title}')
		? normalized
		: getDefaultVideoTypeTitleFormat(normalizedType);
}

export function getComposedVideoTitleFormat(
	video: VideoTitleFormatRecord,
	_event: TitleFormatEvent
) {
	const videoType = normalizeVideoType(video.videoType);

	return normalizeComposedVideoTitleFormat(video.videoTitleFormat, videoType);
}

export function formatVideoTitle(
	format: string | undefined,
	title: string,
	event: TitleFormatEvent
) {
	return cleanupTitlePunctuation(formatWithTitle(normalizeTitleFormat(format), title, event));
}

export function formatVideoRecordTitle(
	format: string | undefined,
	title: string,
	video: VideoTitleFormatRecord
) {
	const titleOverride = normalizeTitleOverride(video.titleOverride);

	if (titleOverride) {
		return titleOverride;
	}

	return cleanupTitlePunctuation(
		formatWithVideoTitle(normalizeVideoTitleFormat(format, video.videoType), title, video)
	);
}

export function formatComposedVideoTitle(
	baseTitle: string,
	video: VideoTitleFormatRecord,
	event: TitleFormatEvent
) {
	const titleOverride = normalizeTitleOverride(video.titleOverride);

	if (titleOverride) {
		return titleOverride;
	}

	return cleanupTitlePunctuation(
		formatWithComposedTitle(getComposedVideoTitleFormat(video, event), baseTitle, video, event)
	);
}

export function previewVideoTitle(
	format: string,
	name: string,
	year: number,
	editionTitle?: string
) {
	return formatVideoTitle(format, 'Video Title', { name, year, editionTitle });
}

export function getTitleFormatAffixes(format: string | undefined, event: TitleFormatEvent) {
	const normalized = normalizeTitleFormat(format);
	const rendered = formatWithTitle(normalized, titlePlaceholder, event);
	const placeholderMatches = rendered.match(new RegExp(titlePlaceholder, 'g')) ?? [];

	if (placeholderMatches.length !== 1) {
		return {
			prefix: '',
			suffix: ''
		};
	}

	const [prefix, suffix] = rendered.split(titlePlaceholder);

	return {
		prefix: normalizeSpaces(prefix),
		suffix: normalizeSpaces(suffix)
	};
}

export function getTitleEventSuffix(format: string | undefined, event: TitleFormatEvent) {
	return getTitleFormatAffixes(format, event).suffix;
}

export function getVideoTitleFormatAffixes(
	format: string | undefined,
	video: VideoTitleFormatRecord
) {
	const normalized = normalizeVideoTitleFormat(format, video.videoType);
	const rendered = formatWithVideoTitle(normalized, titlePlaceholder, video);
	const placeholderMatches = rendered.match(new RegExp(titlePlaceholder, 'g')) ?? [];

	if (placeholderMatches.length !== 1) {
		return {
			prefix: '',
			suffix: ''
		};
	}

	const [prefix, suffix] = rendered.split(titlePlaceholder);

	return {
		prefix: cleanupTitlePunctuation(prefix),
		suffix: cleanupTitlePunctuation(suffix)
	};
}

export function getComposedTitleFormatAffixes(
	video: VideoTitleFormatRecord,
	event: TitleFormatEvent
) {
	const rendered = cleanupTitlePunctuation(
		formatWithComposedTitle(
			getComposedVideoTitleFormat(video, event),
			titlePlaceholder,
			video,
			event
		)
	);
	const placeholderMatches = rendered.match(new RegExp(titlePlaceholder, 'g')) ?? [];

	if (placeholderMatches.length !== 1) {
		return {
			prefix: '',
			suffix: ''
		};
	}

	const [prefix, suffix] = rendered.split(titlePlaceholder);

	return {
		prefix: normalizeSpaces(prefix),
		suffix: normalizeSpaces(suffix)
	};
}

export function deriveBaseTitle(
	currentTitle: string,
	format: string | undefined,
	event: TitleFormatEvent
) {
	const { prefix, suffix } = getTitleFormatAffixes(format, event);
	let baseTitle = normalizeSpaces(currentTitle);

	if (prefix && baseTitle.startsWith(prefix)) {
		baseTitle = normalizeSpaces(baseTitle.slice(prefix.length));
	}

	if (suffix && baseTitle.endsWith(suffix)) {
		baseTitle = normalizeSpaces(baseTitle.slice(0, -suffix.length));
	}

	return cleanupTitlePunctuation(baseTitle) || normalizeSpaces(currentTitle);
}

export function deriveVideoRecordBaseTitle(
	currentTitle: string,
	format: string | undefined,
	video: VideoTitleFormatRecord
) {
	const { prefix, suffix } = getVideoTitleFormatAffixes(format, video);
	let baseTitle = normalizeSpaces(currentTitle);

	if (prefix && baseTitle.startsWith(prefix)) {
		baseTitle = normalizeSpaces(baseTitle.slice(prefix.length));
	}

	if (suffix && baseTitle.endsWith(suffix)) {
		baseTitle = normalizeSpaces(baseTitle.slice(0, -suffix.length));
	}

	return cleanupTitlePunctuation(baseTitle) || normalizeSpaces(currentTitle);
}

export function deriveComposedBaseTitle(
	currentTitle: string,
	video: VideoTitleFormatRecord,
	event: TitleFormatEvent
) {
	const { prefix, suffix } = getComposedTitleFormatAffixes(video, event);
	let baseTitle = normalizeSpaces(currentTitle);
	let strippedComposedAffix = false;

	if (prefix && baseTitle.startsWith(prefix)) {
		baseTitle = normalizeSpaces(baseTitle.slice(prefix.length));
		strippedComposedAffix = true;
	}

	if (suffix && baseTitle.endsWith(suffix)) {
		baseTitle = normalizeSpaces(baseTitle.slice(0, -suffix.length));
		strippedComposedAffix = true;
	}

	if (strippedComposedAffix) {
		return cleanupTitlePunctuation(baseTitle) || normalizeSpaces(currentTitle);
	}

	return deriveVideoRecordBaseTitle(
		deriveBaseTitle(currentTitle, event.titleFormat, event),
		video.videoTitleFormat,
		video
	);
}
