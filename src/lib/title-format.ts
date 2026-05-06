export type TitleFormatEvent = {
	name: string;
	year?: number;
	titleFormat?: string;
};

export type VideoTitleFormatRecord = {
	speaker?: string;
	company?: string;
	position?: string;
	videoTitleFormat?: string;
};

const titlePlaceholder = '__YTP_TITLE__';

export const defaultTitleFormat = '{title} | {event_name} {year}';
export const titleTokens = ['{title}', '{event_name}', '{year}'];
export const defaultVideoTitleFormat = '{title} — {speaker}, {company}';
export const videoTitleTokens = ['{title}', '{speaker}', '{company}'];

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
		.replace(/\s+[—|-]\s*$/g, '')
		.replace(/^\s*[—|-]\s+/g, '')
		.trim();
}

function formatWithTitle(format: string, title: string, event: TitleFormatEvent) {
	return format
		.replace(/{title}/g, title)
		.replace(/{event_name}/g, event.name || 'Event Name')
		.replace(/{year}/g, String(event.year ?? ''));
}

function formatWithVideoTitle(format: string, title: string, video: VideoTitleFormatRecord) {
	return format
		.replace(/{title}/g, title)
		.replace(/{speaker}/g, video.speaker ?? '')
		.replace(/{company}/g, video.company ?? '');
}

export function normalizeTitleFormat(format?: string) {
	const normalized = format?.trim();
	return normalized && normalized.includes('{title}') ? normalized : defaultTitleFormat;
}

export function normalizeVideoTitleFormat(format?: string) {
	const normalized = format?.trim();
	return normalized && normalized.includes('{title}') ? normalized : defaultVideoTitleFormat;
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
	return cleanupTitlePunctuation(
		formatWithVideoTitle(normalizeVideoTitleFormat(format), title, video)
	);
}

export function formatComposedVideoTitle(
	baseTitle: string,
	video: VideoTitleFormatRecord,
	event: TitleFormatEvent
) {
	return formatVideoTitle(
		event.titleFormat,
		formatVideoRecordTitle(video.videoTitleFormat, baseTitle, video),
		event
	);
}

export function previewVideoTitle(format: string, name: string, year: number) {
	return formatVideoTitle(format, 'Video Title', { name, year });
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
	const normalized = normalizeVideoTitleFormat(format);
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
	return deriveVideoRecordBaseTitle(
		deriveBaseTitle(currentTitle, event.titleFormat, event),
		video.videoTitleFormat,
		video
	);
}
