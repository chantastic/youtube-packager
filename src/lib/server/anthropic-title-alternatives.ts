import { env } from '$env/dynamic/private';
import {
	deriveComposedBaseTitle,
	formatComposedVideoTitle,
	getComposedVideoTitleFormat,
	getTitleEventSuffix,
	normalizeTitleFormat,
	normalizeVideoType,
	normalizeVideoTitleFormat,
	videoTypeLabelFor,
	type TitleFormatEvent,
	type VideoTitleFormatRecord
} from '$lib/title-format';
import {
	validateTitleFocus,
	type VideoValidation,
	youtubeTitleFocusLength,
	youtubeTitleMaxLength
} from '$lib/video-validation';

const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
const anthropicVersion = '2023-06-01';
const defaultModel = 'claude-haiku-4-5-20251001';

type AnthropicMessageResponse = {
	content?: Array<{
		type?: string;
		text?: string;
	}>;
	stop_reason?: string;
};

export type TitleAlternativesAssignmentInput = {
	assignmentId: string;
	event: TitleFormatEvent;
	titleValidations?: VideoValidation[];
};

export type SpeakerContextInput = {
	name: string;
	company?: string;
	position?: string;
};

export type VideoContextInput = {
	youtubeVideoId: string;
	title: string;
	description?: string;
	channelTitle?: string;
	publishedAt?: string;
	videoPublishedAt?: string;
	speakers: SpeakerContextInput[];
};

export type TitleAlternativesInput = {
	currentTitle: string;
	description?: string;
	video: VideoTitleFormatRecord;
	videoContext?: VideoContextInput;
	assignments: TitleAlternativesAssignmentInput[];
};

type TitleAlternativeItem = {
	assignmentId?: string;
	baseTitles?: string[];
};

type TitleAlternativesResponse = {
	results?: TitleAlternativeItem[];
};

export type AssignmentTitleAlternatives = {
	assignmentId: string;
	alternatives: string[];
	error: string | null;
};

export type TitleAlternativesResult = {
	alternativesByAssignmentId: Record<string, AssignmentTitleAlternatives>;
	error: string | null;
};

function model() {
	return env.ANTHROPIC_MODEL ?? defaultModel;
}

function stripJsonFence(value: string) {
	return value
		.trim()
		.replace(/^```json\s*/i, '')
		.replace(/^```\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();
}

function textFromAnthropicResponse(response: AnthropicMessageResponse) {
	return response.content?.find((item) => item.type === 'text' && item.text)?.text ?? '';
}

function titleWarningsForPrompt(validations: VideoValidation[] = []) {
	return validations
		.filter((validation) => validation.status === 'fail' || validation.status === 'info')
		.map((validation) => ({
			id: validation.id,
			label: validation.label,
			status: validation.status,
			message: validation.message,
			expected: validation.expected,
			details: validation.details,
			suggested: validation.suggested
		}));
}

export function buildTitleAlternativesPrompt(input: TitleAlternativesInput) {
	const videoType = normalizeVideoType(input.video.videoType);
	const videoContext = {
		youtubeVideoId: input.videoContext?.youtubeVideoId,
		currentTitle: input.currentTitle,
		channelTitle: input.videoContext?.channelTitle,
		publishedAt: input.videoContext?.publishedAt,
		videoPublishedAt: input.videoContext?.videoPublishedAt,
		description: (input.description ?? input.videoContext?.description)?.slice(0, 2000),
		speakers: input.videoContext?.speakers ?? [],
		titleOverride: input.video.titleOverride,
		videoType,
		videoTypeLabel: videoTypeLabelFor(videoType),
		videoTitleFormat: normalizeVideoTitleFormat(input.video.videoTitleFormat, videoType),
		formattedSpeakerText:
			videoType === 'panelDiscussion' ? videoTypeLabelFor(videoType) : input.video.speaker,
		formattedCompanyText: videoType === 'panelDiscussion' ? undefined : input.video.company,
		formattedPositionText: input.video.position
	};
	const formattingVideo = { ...input.video, titleOverride: undefined };
	const assignments = input.assignments.map((assignment) => ({
		assignmentId: assignment.assignmentId,
		eventName: assignment.event.name,
		editionTitle: assignment.event.editionTitle,
		eventYear: assignment.event.year,
		titleFormat: normalizeTitleFormat(assignment.event.titleFormat),
		eventSuffix: getTitleEventSuffix(assignment.event.titleFormat, assignment.event),
		finalTitleFormat: getComposedVideoTitleFormat(formattingVideo, assignment.event),
		currentBaseTitle: deriveComposedBaseTitle(
			input.currentTitle,
			formattingVideo,
			assignment.event
		),
		titleWarnings: titleWarningsForPrompt(assignment.titleValidations)
	}));

	return `Generate concise YouTube title alternatives for each playlist assignment.

The title should read like a punchy YouTube hook, not a conference catalog entry.
Directives and absolute statements work nicely where they are supported by the context.

Return only JSON in this shape:
{
  "results": [
    {
      "assignmentId": "string",
      "baseTitles": ["title without event suffix"]
    }
  ]
}

Rules:
- Return 5 baseTitles for every assignment.
- baseTitles must not include the event name, edition title, event year, or playlist suffix.
- Write baseTitles as strong standalone hooks.
- Prefer direct, active language with a clear viewer payoff.
- Use directive phrasing when natural, such as "Stop...", "Build...", "Ship...", or "Use...".
- Use absolute statements when accurate, such as "X Changes Everything" or "X Is the Missing Piece".
- Avoid vague hype, unsupported claims, clickbait, and titles that overpromise beyond the video context.
- Preserve important proper nouns and technical terms.
- For panel discussions, do not include individual speaker names in baseTitles.
- Favor clear, searchable, readable titles over cleverness.
- Put the concrete topic or hook in the first ${youtubeTitleFocusLength} characters.
- Keep baseTitles concise enough that the final formatted title can be <= ${youtubeTitleMaxLength} characters.
- Use titleWarnings as feedback about problems in the current title.
- Prioritize fixing Hook and Mechanics warnings in the generated baseTitles.
- If a warning is about Profile, Event, or Format, do not copy that metadata into baseTitles; the final formatter handles speaker, company, type, and event text.
- Do not blindly copy suggested text if it conflicts with the title format, context, or length limit.
- Do not include angle brackets.

Video context:
${JSON.stringify(videoContext, null, 2)}

Assignments:
${JSON.stringify(assignments, null, 2)}`;
}

export function parseTitleAlternativesResponse(value: string): TitleAlternativesResponse {
	return JSON.parse(stripJsonFence(value)) as TitleAlternativesResponse;
}

export function finalizeTitleAlternatives(
	baseTitles: string[],
	currentTitle: string,
	video: VideoTitleFormatRecord,
	event: TitleFormatEvent
) {
	const formattingVideo = { ...video, titleOverride: undefined };
	const currentFormattedTitle = formatComposedVideoTitle(
		deriveComposedBaseTitle(currentTitle, formattingVideo, event),
		formattingVideo,
		event
	);
	const seen = new Set<string>();
	const alternatives: string[] = [];

	for (const baseTitle of baseTitles) {
		const finalTitle = formatComposedVideoTitle(baseTitle, formattingVideo, event);
		const titleFocus = validateTitleFocus(finalTitle, event, {
			speakers: video.speaker ? [{ name: video.speaker, company: video.company }] : []
		});

		if (
			finalTitle.length <= youtubeTitleMaxLength &&
			titleFocus.status !== 'fail' &&
			finalTitle !== currentFormattedTitle &&
			!seen.has(finalTitle)
		) {
			alternatives.push(finalTitle);
			seen.add(finalTitle);
		}

		if (alternatives.length === 5) {
			break;
		}
	}

	return alternatives;
}

function fallbackAlternativesByAssignmentId(input: TitleAlternativesInput, error: string) {
	return Object.fromEntries(
		input.assignments.map((assignment) => [
			assignment.assignmentId,
			{
				assignmentId: assignment.assignmentId,
				alternatives: [],
				error
			}
		])
	);
}

function anthropicErrorMessage(message: string | undefined, status: number) {
	const fallback = `Anthropic title alternatives failed with ${status}.`;

	if (!message) {
		return fallback;
	}

	if (message.toLowerCase().includes('model')) {
		return `Anthropic title alternatives could not use model "${model()}". Set ANTHROPIC_MODEL to a model available for this API key.`;
	}

	return message;
}

export async function generateTitleAlternativesWithAnthropic(
	input: TitleAlternativesInput
): Promise<TitleAlternativesResult> {
	if (input.assignments.length === 0) {
		return { alternativesByAssignmentId: {}, error: null };
	}

	if (!env.ANTHROPIC_API_KEY) {
		const error = 'Set ANTHROPIC_API_KEY to generate title alternatives.';

		return {
			alternativesByAssignmentId: fallbackAlternativesByAssignmentId(input, error),
			error
		};
	}

	let response: Response;

	try {
		response = await fetch(anthropicApiUrl, {
			method: 'POST',
			headers: {
				'x-api-key': env.ANTHROPIC_API_KEY,
				'anthropic-version': anthropicVersion,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				model: model(),
				max_tokens: 2048,
				messages: [
					{
						role: 'user',
						content: buildTitleAlternativesPrompt(input)
					}
				]
			})
		});
	} catch {
		const error = 'Anthropic title alternatives are temporarily unavailable.';

		return {
			alternativesByAssignmentId: fallbackAlternativesByAssignmentId(input, error),
			error
		};
	}

	const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse & {
		error?: { message?: string };
	};

	if (!response.ok) {
		const error = anthropicErrorMessage(body.error?.message, response.status);

		return {
			alternativesByAssignmentId: fallbackAlternativesByAssignmentId(input, error),
			error
		};
	}

	if (body.stop_reason === 'max_tokens') {
		const error = 'Anthropic title alternatives response was truncated.';

		return {
			alternativesByAssignmentId: fallbackAlternativesByAssignmentId(input, error),
			error
		};
	}

	try {
		const parsed = parseTitleAlternativesResponse(textFromAnthropicResponse(body));
		const resultsByAssignmentId = new Map(
			(parsed.results ?? []).map((result) => [result.assignmentId, result.baseTitles ?? []])
		);
		const alternativesByAssignmentId: Record<string, AssignmentTitleAlternatives> = {};

		for (const assignment of input.assignments) {
			const alternatives = finalizeTitleAlternatives(
				resultsByAssignmentId.get(assignment.assignmentId) ?? [],
				input.currentTitle,
				input.video,
				assignment.event
			);

			alternativesByAssignmentId[assignment.assignmentId] = {
				assignmentId: assignment.assignmentId,
				alternatives,
				error: alternatives.length ? null : 'No alternatives fit the playlist rules.'
			};
		}

		return {
			alternativesByAssignmentId,
			error: null
		};
	} catch {
		const error = 'Anthropic returned unreadable title alternatives.';

		return {
			alternativesByAssignmentId: fallbackAlternativesByAssignmentId(input, error),
			error
		};
	}
}
