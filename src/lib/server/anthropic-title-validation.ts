import { env } from '$env/dynamic/private';
import type { VideoValidation } from '$lib/video-validation';

const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
const anthropicVersion = '2023-06-01';
const defaultModel = 'claude-haiku-4-5-20251001';
export const titleQualityValidationVersion = 'title-quality-v1';

type TitleInput = {
	videoId: string;
	title: string;
};

type AnthropicMessageResponse = {
	content?: Array<{
		type?: string;
		text?: string;
	}>;
};

type TitleQualityItem = {
	videoId?: string;
	status?: 'pass' | 'fail' | 'info';
	message?: string;
	details?: string[];
	suggested?: string;
};

type TitleQualityResponse = {
	results?: TitleQualityItem[];
};

export type TitleQualityValidationResult = {
	validationsByVideoId: Record<string, VideoValidation[]>;
	error: string | null;
};

function buildPrompt(titles: TitleInput[]) {
	return `Evaluate these YouTube video titles for spelling, grammar, and readability.

Return only JSON in this shape:
{
  "results": [
    {
      "videoId": "string",
      "status": "pass" | "fail" | "info",
      "message": "short validation message",
      "details": ["specific issue, if any"],
      "suggested": "optional corrected title"
    }
  ]
}

Guidelines:
- Use "pass" when the title reads cleanly.
- Use "fail" for likely spelling, grammar, punctuation, casing, or readability problems.
- Use "info" only when the title is too ambiguous to judge.
- Return exactly one result for every input title.
- The result videoId must exactly match the input videoId.
- Do not change proper nouns, product names, speaker names, event names, framework names, or intentional title casing unless clearly wrong.
- Keep messages short enough to fit in a table.
- Include suggestions only when you are confident.

Titles:
${JSON.stringify(titles, null, 2)}`;
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
	const parsed = JSON.parse(stripJsonFence(value)) as TitleQualityResponse;
	const validationsByVideoId: Record<string, VideoValidation[]> = {};

	for (const result of parsed.results ?? []) {
		if (!result.videoId || !result.status || !result.message) {
			continue;
		}

		validationsByVideoId[result.videoId] = [
			{
				id: 'title-quality',
				label: 'Title quality',
				status: result.status,
				message: result.message,
				details: result.details,
				suggested: result.suggested
			}
		];
	}

	return validationsByVideoId;
}

function countValidations(validationsByVideoId: Record<string, VideoValidation[]>) {
	return Object.values(validationsByVideoId).reduce(
		(total, validations) => total + validations.length,
		0
	);
}

export function titleQualityValidationModel() {
	return env.ANTHROPIC_MODEL ?? defaultModel;
}

function anthropicErrorMessage(message: string | undefined, status: number) {
	const fallback = `Anthropic validation failed with ${status}.`;

	if (!message) {
		return fallback;
	}

	if (message.toLowerCase().includes('model')) {
		return `Anthropic title validation could not use model "${titleQualityValidationModel()}". Set ANTHROPIC_MODEL to a model available for this API key.`;
	}

	return message;
}

export async function validateTitleQualityWithAnthropic(
	titles: TitleInput[]
): Promise<TitleQualityValidationResult> {
	if (titles.length === 0) {
		return { validationsByVideoId: {}, error: null };
	}

	if (!env.ANTHROPIC_API_KEY) {
		return {
			validationsByVideoId: {},
			error: 'Set ANTHROPIC_API_KEY to run spelling, grammar, and readability checks.'
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
				model: titleQualityValidationModel(),
				max_tokens: 2048,
				messages: [
					{
						role: 'user',
						content: buildPrompt(titles)
					}
				]
			})
		});
	} catch {
		return {
			validationsByVideoId: {},
			error: 'Anthropic title validation is temporarily unavailable.'
		};
	}

	const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse & {
		error?: { message?: string };
	};

	if (!response.ok) {
		return {
			validationsByVideoId: {},
			error: anthropicErrorMessage(body.error?.message, response.status)
		};
	}

	try {
		const validationsByVideoId = parseTitleQualityResponse(textFromAnthropicResponse(body));
		const validationCount = countValidations(validationsByVideoId);

		return {
			validationsByVideoId,
			error:
				validationCount > 0 ? null : 'Anthropic returned no title-quality checks for this playlist.'
		};
	} catch {
		return {
			validationsByVideoId: {},
			error: 'Anthropic returned an unreadable title validation response.'
		};
	}
}
