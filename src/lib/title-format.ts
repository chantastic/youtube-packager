export type TitleFormatEvent = {
	name: string;
	year?: number;
	titleFormat?: string;
};

const titlePlaceholder = '__YTP_TITLE__';

export const defaultTitleFormat = '{title} | {event_name} {year}';
export const titleTokens = ['{title}', '{event_name}', '{year}'];

function normalizeSpaces(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

function formatWithTitle(format: string, title: string, event: TitleFormatEvent) {
	return format
		.replace(/{title}/g, title)
		.replace(/{event_name}/g, event.name || 'Event Name')
		.replace(/{year}/g, String(event.year ?? ''));
}

export function normalizeTitleFormat(format?: string) {
	const normalized = format?.trim();
	return normalized && normalized.includes('{title}') ? normalized : defaultTitleFormat;
}

export function formatVideoTitle(
	format: string | undefined,
	title: string,
	event: TitleFormatEvent
) {
	return normalizeSpaces(formatWithTitle(normalizeTitleFormat(format), title, event));
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

	return baseTitle || normalizeSpaces(currentTitle);
}
