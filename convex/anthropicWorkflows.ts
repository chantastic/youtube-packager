import { v } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import {
	getAnthropicApiKey,
	getAnthropicDescriptionEffort,
	getAnthropicDescriptionModel,
	getAnthropicModel
} from './secrets';
import type { ActionCtx } from './_generated/server';
import {
	buildTitleAlternativesPrompt,
	fallbackAlternativesByAssignmentId,
	titleAlternativesFromResponse,
	type TitleAlternativesInput,
	type TitleAlternativesResult
} from '../src/lib/title-alternatives';
import {
	descriptionFromResponse,
	descriptionOutputConfig,
	descriptionPromptForInput,
	isOpus47Model,
	type DescriptionGenerationInput,
	type DescriptionGenerationResult
} from '../src/lib/description-generation';

const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
const anthropicVersion = '2023-06-01';
const defaultModel = 'claude-haiku-4-5-20251001';
const defaultDescriptionModel = 'claude-opus-4-7';
const defaultDescriptionEffort = 'high';
const titleAiValidationBatchSize = 20;
const titleAiValidationMaxTokens = 4096;
const titleAlternativesMaxTokens = 2048;
const descriptionMaxTokens = 8192;

const titleAiValidationCheckIdValidator = v.union(v.literal('hook'), v.literal('mechanics'));
const titleAiPromptVersions = {
	hook: 'title-hook-v1',
	mechanics: 'title-mechanics-v1'
} as const satisfies Record<TitleAiValidationCheckId, string>;

const titleAiValidationCacheInputValidator = v.object({
	videoId: v.string(),
	field: v.string(),
	checkId: titleAiValidationCheckIdValidator,
	label: v.string(),
	input: v.any()
});

const titleAiValidationInputValidator = v.object({
	requestId: v.string(),
	videoId: v.string(),
	field: v.string(),
	checkId: titleAiValidationCheckIdValidator,
	label: v.string(),
	input: v.any()
});

type TitleAiValidationCheckId = 'hook' | 'mechanics';

type TitleAiValidationInput = {
	videoId: string;
	field: string;
	checkId: TitleAiValidationCheckId;
	label: string;
	input: unknown;
};

type TitleAiValidationRequest = {
	requestId: string;
	videoId: string;
	checkId: TitleAiValidationCheckId;
	label: string;
	input: unknown;
};

type AiValidationCacheKey = {
	videoId: string;
	field: string;
	checkId: string;
	inputHash: string;
	model: string;
	promptVersion: string;
	modelConfigHash: string;
};

type AiValidationCacheEntry = TitleAiValidationInput & {
	cacheKey: AiValidationCacheKey;
	cacheKeyString: string;
	inputKey: string;
	inputSnapshot: string;
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

function titleAiValidationPromptVersion(checkId: TitleAiValidationCheckId) {
	return titleAiPromptVersions[checkId];
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

async function sha256Hex(value: string) {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);

	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

async function titleAiValidationModelConfigHash() {
	return await sha256Hex(
		JSON.stringify({
			anthropicVersion,
			maxTokens: titleAiValidationMaxTokens
		})
	);
}

function titleAiValidationInputKey(input: TitleAiValidationInput) {
	return `${input.videoId}:${input.field}:${input.checkId}:${JSON.stringify(input.input)}`;
}

function cacheKeyString(key: AiValidationCacheKey) {
	return [
		key.videoId,
		key.field,
		key.checkId,
		key.inputHash,
		key.model,
		key.promptVersion,
		key.modelConfigHash
	].join(':');
}

async function aiValidationCacheKey(input: TitleAiValidationInput): Promise<AiValidationCacheKey> {
	const inputSnapshot = JSON.stringify(input.input);

	return {
		videoId: input.videoId,
		field: input.field,
		checkId: input.checkId,
		inputHash: await sha256Hex(inputSnapshot),
		model: titleAiValidationModel(),
		promptVersion: titleAiValidationPromptVersion(input.checkId),
		modelConfigHash: await titleAiValidationModelConfigHash()
	};
}

async function planTitleAiValidationCache(ctx: ActionCtx, inputs: TitleAiValidationInput[]) {
	const entries = await Promise.all(
		inputs.map(async (input) => {
			const cacheKey = await aiValidationCacheKey(input);

			return {
				...input,
				cacheKey,
				cacheKeyString: cacheKeyString(cacheKey),
				inputKey: titleAiValidationInputKey(input),
				inputSnapshot: JSON.stringify(input.input)
			};
		})
	);
	const cached = await ctx.runQuery(internal.aiValidationChecks.collectByCacheKeyInternal, {
		keys: entries.map((entry) => entry.cacheKey)
	});
	const cachedByCacheKey = new Map(
		cached.map((check) => [cacheKeyString(check), check.validation])
	);
	const cachedValidationsByCacheKey: Record<string, VideoValidation> = {};
	const misses: AiValidationCacheEntry[] = [];

	for (const entry of entries) {
		const validation = cachedByCacheKey.get(entry.cacheKeyString);

		if (validation) {
			cachedValidationsByCacheKey[entry.cacheKeyString] = validation;
		} else {
			misses.push(entry);
		}
	}

	return {
		entries,
		cachedValidationsByCacheKey,
		misses
	};
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

function titleAlternativesErrorMessage(message: string | undefined, status: number) {
	const fallback = `Anthropic title alternatives failed with ${status}.`;

	if (!message) {
		return fallback;
	}

	if (message.toLowerCase().includes('model')) {
		return `Anthropic title alternatives could not use model "${titleAiValidationModel()}". Set ANTHROPIC_MODEL to a model available for this API key.`;
	}

	return message;
}

function descriptionModel() {
	return getAnthropicDescriptionModel(defaultDescriptionModel);
}

function descriptionErrorMessage(message: string | undefined, status: number) {
	const fallback = `Anthropic description generation failed with ${status}.`;

	if (!message) {
		return fallback;
	}

	if (message.toLowerCase().includes('model')) {
		return `Anthropic description generation could not use model "${descriptionModel()}". Set ANTHROPIC_DESCRIPTION_MODEL to a model available for this API key.`;
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

async function validateTitleAiInputs(
	inputs: Array<TitleAiValidationInput & { requestId: string }>
): Promise<TitleAiValidationResult> {
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

function titleAiChecksResult(
	entries: AiValidationCacheEntry[],
	cachedValidationsByCacheKey: Record<string, VideoValidation>,
	freshValidationsByRequestId: Record<string, VideoValidation>
) {
	const validationsByInputKey: Record<string, VideoValidation> = {};
	const validationsByVideoId: Record<string, VideoValidation[]> = {};

	for (const entry of entries) {
		const validation =
			cachedValidationsByCacheKey[entry.cacheKeyString] ??
			freshValidationsByRequestId[entry.cacheKeyString];

		if (!validation) {
			continue;
		}

		validationsByInputKey[entry.inputKey] = validation;
		validationsByVideoId[entry.videoId] = [
			...(validationsByVideoId[entry.videoId] ?? []),
			validation
		];
	}

	return {
		validationsByInputKey,
		validationsByVideoId
	};
}

export const validateTitleAiChecks = action({
	args: {
		inputs: v.array(titleAiValidationInputValidator)
	},
	handler: async (_ctx, { inputs }): Promise<TitleAiValidationResult> => {
		return await validateTitleAiInputs(inputs);
	}
});

export const collectCachedTitleAiChecks = action({
	args: {
		inputs: v.array(titleAiValidationCacheInputValidator)
	},
	handler: async (ctx, { inputs }) => {
		const cachePlan = await planTitleAiValidationCache(ctx, inputs);

		return {
			...titleAiChecksResult(cachePlan.entries, cachePlan.cachedValidationsByCacheKey, {}),
			cache: {
				hits: cachePlan.entries.length - cachePlan.misses.length,
				misses: cachePlan.misses.length,
				writes: 0,
				total: cachePlan.entries.length
			}
		};
	}
});

export const buildTitleAiChecks = action({
	args: {
		inputs: v.array(titleAiValidationCacheInputValidator)
	},
	handler: async (ctx, { inputs }) => {
		const cachePlan = await planTitleAiValidationCache(ctx, inputs);
		const freshResult = await validateTitleAiInputs(
			cachePlan.misses.map((entry) => ({
				requestId: entry.cacheKeyString,
				videoId: entry.videoId,
				field: entry.field,
				checkId: entry.checkId,
				label: entry.label,
				input: entry.input
			}))
		);
		const now = Date.now();
		const freshEntries = cachePlan.misses.flatMap((entry) => {
			const validation = freshResult.validationsByRequestId[entry.cacheKeyString];

			return validation
				? [
						{
							...entry.cacheKey,
							inputSnapshot: entry.inputSnapshot,
							validation,
							checkedAt: now
						}
					]
				: [];
		});

		if (freshEntries.length) {
			await ctx.runMutation(internal.aiValidationChecks.upsertManyInternal, {
				checks: freshEntries
			});
		}

		return {
			...titleAiChecksResult(
				cachePlan.entries,
				cachePlan.cachedValidationsByCacheKey,
				freshResult.validationsByRequestId
			),
			error: freshResult.error,
			cache: {
				hits: cachePlan.entries.length - cachePlan.misses.length,
				misses: cachePlan.misses.length,
				writes: freshEntries.length,
				total: cachePlan.entries.length
			}
		};
	}
});

export const generateTitleAlternatives = action({
	args: {
		input: v.any()
	},
	handler: async (_ctx, { input }): Promise<TitleAlternativesResult> => {
		const titleInput = input as TitleAlternativesInput;

		if (titleInput.assignments.length === 0) {
			return { alternativesByAssignmentId: {}, error: null };
		}

		if (!getAnthropicApiKey()) {
			const error = 'Set ANTHROPIC_API_KEY to generate title alternatives.';

			return {
				alternativesByAssignmentId: fallbackAlternativesByAssignmentId(titleInput, error),
				error
			};
		}

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
					max_tokens: titleAlternativesMaxTokens,
					messages: [
						{
							role: 'user',
							content: buildTitleAlternativesPrompt(titleInput)
						}
					]
				})
			});
		} catch {
			const error = 'Anthropic title alternatives are temporarily unavailable.';

			return {
				alternativesByAssignmentId: fallbackAlternativesByAssignmentId(titleInput, error),
				error
			};
		}

		const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse;

		if (!response.ok) {
			const error = titleAlternativesErrorMessage(body.error?.message, response.status);

			return {
				alternativesByAssignmentId: fallbackAlternativesByAssignmentId(titleInput, error),
				error
			};
		}

		if (body.stop_reason === 'max_tokens') {
			const error = 'Anthropic title alternatives response was truncated.';

			return {
				alternativesByAssignmentId: fallbackAlternativesByAssignmentId(titleInput, error),
				error
			};
		}

		try {
			return titleAlternativesFromResponse(titleInput, textFromAnthropicResponse(body));
		} catch {
			const error = 'Anthropic returned unreadable title alternatives.';

			return {
				alternativesByAssignmentId: fallbackAlternativesByAssignmentId(titleInput, error),
				error
			};
		}
	}
});

export const generateDescription = action({
	args: {
		input: v.any()
	},
	handler: async (_ctx, { input }): Promise<DescriptionGenerationResult> => {
		const descriptionInput = input as DescriptionGenerationInput;
		const prompt = descriptionPromptForInput(descriptionInput);

		if (prompt.error) {
			return {
				description: null,
				error: prompt.error
			};
		}

		if (!getAnthropicApiKey()) {
			return {
				description: null,
				error: 'Set ANTHROPIC_API_KEY to generate descriptions.'
			};
		}

		let response: Response;

		try {
			const selectedModel = descriptionModel();
			response = await fetch(anthropicApiUrl, {
				method: 'POST',
				headers: {
					'x-api-key': getAnthropicApiKey() ?? '',
					'anthropic-version': anthropicVersion,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					model: selectedModel,
					max_tokens: descriptionMaxTokens,
					...(isOpus47Model(selectedModel)
						? {
								thinking: {
									type: 'adaptive'
								}
							}
						: {}),
					output_config: {
						...descriptionOutputConfig(selectedModel),
						...(isOpus47Model(selectedModel)
							? { effort: getAnthropicDescriptionEffort(defaultDescriptionEffort) }
							: {})
					},
					messages: [
						{
							role: 'user',
							content: prompt.prompt
						}
					]
				})
			});
		} catch {
			return {
				description: null,
				error: 'Anthropic description generation is temporarily unavailable.'
			};
		}

		const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse;

		if (!response.ok) {
			return {
				description: null,
				error: descriptionErrorMessage(body.error?.message, response.status)
			};
		}

		if (body.stop_reason === 'max_tokens') {
			return {
				description: null,
				error: 'Anthropic description generation response was truncated.'
			};
		}

		try {
			return descriptionFromResponse(
				descriptionInput,
				textFromAnthropicResponse(body),
				descriptionModel()
			);
		} catch {
			return {
				description: null,
				error: 'Anthropic returned an unreadable description.'
			};
		}
	}
});
