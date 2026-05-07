import { env } from '$env/dynamic/private';
import type { TitleAiValidationCheckId, TitleAiValidationInput } from '$lib/title-ai-validation';
import type { VideoValidation } from '$lib/video-validation';

const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
const anthropicVersion = '2023-06-01';
const defaultModel = 'claude-haiku-4-5-20251001';
const titleAiValidationBatchSize = 20;
const titleAiValidationMaxTokens = 4096;
export const titleQualityValidationVersion = 'title-mechanics-v1';

const titleAiPromptVersions = {
	hook: 'title-hook-v1',
	mechanics: titleQualityValidationVersion
} as const satisfies Record<TitleAiValidationCheckId, string>;

type TitleInput = {
	videoId: string;
	title: string;
};

type AnthropicMessageResponse = {
	content?: Array<{
		type?: string;
		text?: string;
	}>;
	stop_reason?: string;
};

export type TitleAiValidationRequest = {
	requestId: string;
	videoId: string;
	checkId: TitleAiValidationCheckId;
	label: string;
	input: Record<string, unknown>;
};

type TitleAiValidationItem = {
	requestId?: string;
	status?: 'pass' | 'fail' | 'info';
	message?: string;
	details?: string[];
	suggested?: string;
};

type TitleAiValidationResponse = {
	results?: TitleAiValidationItem[];
};

export type TitleAiValidationResult = {
	validationsByRequestId: Record<string, VideoValidation>;
	error: string | null;
};

export type TitleQualityValidationResult = {
	validationsByVideoId: Record<string, VideoValidation[]>;
	error: string | null;
};

function buildPrompt(requests: TitleAiValidationRequest[]) {
	return `Evaluate these YouTube video title validation requests. Each request has a checkId.

Return only JSON in this shape:
{
  "results": [
    {
      "requestId": "string",
      "status": "pass" | "fail" | "info",
      "message": "short validation message",
      "details": ["specific issue, if any"],
      "suggested": "optional corrected title"
    }
  ]
}

Guidelines:
- Use "info" only when the title is too ambiguous to judge.
- Return exactly one result for every input request.
- The result requestId must exactly match the input requestId.
- Keep messages short enough to fit in a table.
- Include suggestions only when you are confident.

For checkId "hook":
- Judge input.hookText, not the full title.
- input.hookText is the editorial title segment, capped by input.maxHookLength title characters in product UI, and stops before speaker, company, event, or type formatting when that boundary is known.
- Use the full title, event, video type, and speakers only as context.
- Pass when the hookText is concrete, front-loaded, readable, and likely to make a YouTube viewer understand the payoff quickly.
- Fail when it is vague, generic, buried in setup, starts with event/speaker/company metadata, or wastes prime title space on weak framing like "Overview", "Introduction", "Panel", "Talk", or "Session".
- A good hook can be a punchy directive, an absolute statement, or a specific claim.

For checkId "mechanics":
- Evaluate the full input.title for spelling, punctuation, capitalization, grammar, and readability.
- Use "pass" when the title reads cleanly.
- Use "fail" for likely spelling, grammar, punctuation, casing, or readability problems.
- Do not change proper nouns, product names, speaker names, event names, framework names, or intentional title casing unless clearly wrong.

Requests:
${JSON.stringify(requests, null, 2)}`;
}

function textFromAnthropicResponse(response: AnthropicMessageResponse) {
	return response.content?.find((item) => item.type === 'text' && item.text)?.text ?? '';
}

function stripJsonFence(value: string) {
	return value
		.trim()
		.replace(/^```json\s*/i, '')
		.replace(/^```\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();
}

export function parseTitleQualityResponse(value: string): Record<string, VideoValidation[]> {
	const parsed = JSON.parse(stripJsonFence(value)) as {
		results?: Array<TitleAiValidationItem & { videoId?: string }>;
	};
	const validationsByVideoId: Record<string, VideoValidation[]> = {};

	for (const result of parsed.results ?? []) {
		if (!result.videoId || !result.status || !result.message) {
			continue;
		}

		validationsByVideoId[result.videoId] = [
			{
				id: 'mechanics',
				label: 'Mechanics',
				status: result.status,
				message: result.message,
				...(Array.isArray(result.details) && result.details.length
					? {
							details: result.details.filter(
								(detail): detail is string => typeof detail === 'string'
							)
						}
					: {}),
				...(typeof result.suggested === 'string' && result.suggested.length
					? { suggested: result.suggested }
					: {})
			}
		];
	}

	return validationsByVideoId;
}

export function parseTitleAiValidationResponse(
	value: string,
	requests: TitleAiValidationRequest[]
): Record<string, VideoValidation> {
	const parsed = JSON.parse(stripJsonFence(value)) as TitleAiValidationResponse;
	const requestsById = new Map(requests.map((request) => [request.requestId, request]));
	const validationsByRequestId: Record<string, VideoValidation> = {};

	for (const result of parsed.results ?? []) {
		if (!result.requestId || !result.status || !result.message) {
			continue;
		}

		const request = requestsById.get(result.requestId);

		if (!request) {
			continue;
		}

		validationsByRequestId[result.requestId] = {
			id: request.checkId,
			label: request.label,
			status: result.status,
			message: result.message,
			...(Array.isArray(result.details) && result.details.length
				? {
						details: result.details.filter((detail): detail is string => typeof detail === 'string')
					}
				: {}),
			...(typeof result.suggested === 'string' && result.suggested.length
				? { suggested: result.suggested }
				: {})
		};
	}

	return validationsByRequestId;
}

function countValidationsByRequestId(validationsByRequestId: Record<string, VideoValidation>) {
	return Object.keys(validationsByRequestId).length;
}

export function chunkTitleQualityInputs(titles: TitleInput[]) {
	const batches: TitleInput[][] = [];

	for (let index = 0; index < titles.length; index += titleAiValidationBatchSize) {
		batches.push(titles.slice(index, index + titleAiValidationBatchSize));
	}

	return batches;
}

export function chunkTitleAiValidationRequests(requests: TitleAiValidationRequest[]) {
	const batches: TitleAiValidationRequest[][] = [];

	for (let index = 0; index < requests.length; index += titleAiValidationBatchSize) {
		batches.push(requests.slice(index, index + titleAiValidationBatchSize));
	}

	return batches;
}

export function titleAiValidationModel() {
	return env.ANTHROPIC_MODEL ?? defaultModel;
}

export function titleQualityValidationModel() {
	return titleAiValidationModel();
}

export function titleAiValidationPromptVersion(checkId: TitleAiValidationCheckId) {
	return titleAiPromptVersions[checkId];
}

export async function titleAiValidationModelConfigHash() {
	const bytes = new TextEncoder().encode(
		JSON.stringify({
			anthropicVersion,
			maxTokens: titleAiValidationMaxTokens
		})
	);
	const digest = await crypto.subtle.digest('SHA-256', bytes);

	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function anthropicErrorMessage(message: string | undefined, status: number) {
	const fallback = `Anthropic validation failed with ${status}.`;

	if (!message) {
		return fallback;
	}

	if (message.toLowerCase().includes('model')) {
		return `Anthropic title validation could not use model "${titleAiValidationModel()}". Set ANTHROPIC_MODEL to a model available for this API key.`;
	}

	return message;
}

async function validateTitleAiBatchWithAnthropic(
	requests: TitleAiValidationRequest[]
): Promise<TitleAiValidationResult> {
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
				model: titleAiValidationModel(),
				max_tokens: titleAiValidationMaxTokens,
				messages: [
					{
						role: 'user',
						content: buildPrompt(requests)
					}
				]
			})
		});
	} catch {
		return {
			validationsByRequestId: {},
			error: 'Anthropic title validation is temporarily unavailable.'
		};
	}

	const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse & {
		error?: { message?: string };
	};

	if (!response.ok) {
		return {
			validationsByRequestId: {},
			error: anthropicErrorMessage(body.error?.message, response.status)
		};
	}

	if (body.stop_reason === 'max_tokens') {
		return {
			validationsByRequestId: {},
			error: 'Anthropic title validation response was truncated. Try a smaller batch.'
		};
	}

	try {
		const validationsByRequestId = parseTitleAiValidationResponse(
			textFromAnthropicResponse(body),
			requests
		);
		const validationCount = countValidationsByRequestId(validationsByRequestId);

		return {
			validationsByRequestId,
			error: validationCount > 0 ? null : 'Anthropic returned no AI title checks for this playlist.'
		};
	} catch {
		return {
			validationsByRequestId: {},
			error: 'Anthropic returned an unreadable title validation response.'
		};
	}
}

export async function validateTitleAiChecksWithAnthropic(
	inputs: Array<TitleAiValidationInput & { requestId: string }>
): Promise<TitleAiValidationResult> {
	if (inputs.length === 0) {
		return { validationsByRequestId: {}, error: null };
	}

	if (!env.ANTHROPIC_API_KEY) {
		return {
			validationsByRequestId: {},
			error: 'Set ANTHROPIC_API_KEY to run AI title checks.'
		};
	}

	const requests = inputs.map((input) => ({
		requestId: input.requestId,
		videoId: input.videoId,
		checkId: input.checkId,
		label: input.label,
		input: input.input
	}));
	const validationsByRequestId: Record<string, VideoValidation> = {};
	const errors: string[] = [];

	for (const batch of chunkTitleAiValidationRequests(requests)) {
		const result = await validateTitleAiBatchWithAnthropic(batch);

		Object.assign(validationsByRequestId, result.validationsByRequestId);

		if (result.error) {
			errors.push(result.error);
		}
	}

	return {
		validationsByRequestId,
		error: errors[0] ?? null
	};
}

export async function validateTitleQualityWithAnthropic(
	titles: TitleInput[]
): Promise<TitleQualityValidationResult> {
	const inputs = titles.map((title) => ({
		requestId: title.videoId,
		videoId: title.videoId,
		field: 'title' as const,
		checkId: 'mechanics' as const,
		label: 'Mechanics',
		input: {
			title: title.title
		}
	}));
	const result = await validateTitleAiChecksWithAnthropic(inputs);
	const validationsByVideoId: Record<string, VideoValidation[]> = {};

	for (const title of titles) {
		const validation = result.validationsByRequestId[title.videoId];

		if (validation) {
			validationsByVideoId[title.videoId] = [validation];
		}
	}

	return {
		validationsByVideoId,
		error: result.error
	};
}
