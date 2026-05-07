import { v } from 'convex/values';
import { action } from './_generated/server';
import { getAnthropicApiKey, getAnthropicModel } from './secrets';

const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
const anthropicVersion = '2023-06-01';
const defaultModel = 'claude-haiku-4-5-20251001';
const titleAiValidationBatchSize = 20;
const titleAiValidationMaxTokens = 4096;

const titleAiValidationCheckIdValidator = v.union(v.literal('hook'), v.literal('mechanics'));

const titleAiValidationInputValidator = v.object({
	requestId: v.string(),
	videoId: v.string(),
	field: v.string(),
	checkId: titleAiValidationCheckIdValidator,
	label: v.string(),
	input: v.any()
});

type TitleAiValidationCheckId = 'hook' | 'mechanics';

type TitleAiValidationRequest = {
	requestId: string;
	videoId: string;
	checkId: TitleAiValidationCheckId;
	label: string;
	input: unknown;
};

type AnthropicMessageResponse = {
	content?: Array<{
		type?: string;
		text?: string;
	}>;
	stop_reason?: string;
	error?: {
		message?: string;
	};
};

type TitleAiValidationItem = {
	requestId?: string;
	status?: 'pass' | 'fail' | 'info';
	message?: string;
	details?: string[];
	suggested?: string;
};

type VideoValidation = {
	id: string;
	label: string;
	status: 'pass' | 'fail' | 'info' | 'pending';
	message: string;
	expected?: string;
	details?: string[];
	suggested?: string;
};

type TitleAiValidationResult = {
	validationsByRequestId: Record<string, VideoValidation>;
	error: string | null;
};

function titleAiValidationModel() {
	return getAnthropicModel(defaultModel);
}

function buildTitleAiValidationPrompt(requests: TitleAiValidationRequest[]) {
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

function chunkTitleAiValidationRequests(requests: TitleAiValidationRequest[]) {
	const batches: TitleAiValidationRequest[][] = [];

	for (let index = 0; index < requests.length; index += titleAiValidationBatchSize) {
		batches.push(requests.slice(index, index + titleAiValidationBatchSize));
	}

	return batches;
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

function parseTitleAiValidationResponse(
	value: string,
	requests: TitleAiValidationRequest[]
): Record<string, VideoValidation> {
	const parsed = JSON.parse(stripJsonFence(value)) as { results?: TitleAiValidationItem[] };
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

async function validateTitleAiBatch(
	requests: TitleAiValidationRequest[]
): Promise<TitleAiValidationResult> {
	let response: Response;

	try {
		response = await fetch(anthropicApiUrl, {
			method: 'POST',
			headers: {
				'x-api-key': getAnthropicApiKey() ?? '',
				'anthropic-version': anthropicVersion,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				model: titleAiValidationModel(),
				max_tokens: titleAiValidationMaxTokens,
				messages: [
					{
						role: 'user',
						content: buildTitleAiValidationPrompt(requests)
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

	const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse;

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

		return {
			validationsByRequestId,
			error:
				Object.keys(validationsByRequestId).length > 0
					? null
					: 'Anthropic returned no AI title checks for this playlist.'
		};
	} catch {
		return {
			validationsByRequestId: {},
			error: 'Anthropic returned an unreadable title validation response.'
		};
	}
}

export const validateTitleAiChecks = action({
	args: {
		inputs: v.array(titleAiValidationInputValidator)
	},
	handler: async (_ctx, { inputs }): Promise<TitleAiValidationResult> => {
		if (inputs.length === 0) {
			return { validationsByRequestId: {}, error: null };
		}

		if (!getAnthropicApiKey()) {
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
			const result = await validateTitleAiBatch(batch);

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
});
