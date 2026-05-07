import { v } from 'convex/values';
import { action, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { anthropicLlmProvider } from './anthropicLlmProvider';
import { requireOrganizationId } from './authz';
import type { LlmProvider } from './llmProvider';
import {
	titleAiPromptVersions,
	titleAiValidationCacheInputValidator,
	titleAiValidationInputValidator,
	type AiValidationCacheEntry,
	type TitleAiValidationCheckId,
	type TitleAiValidationInput,
	type TitleAiValidationItem,
	type TitleAiValidationRequest,
	type TitleAiValidationResult
} from './titleAiValidationTypes';
import type { AiValidationCacheKey } from './aiValidationCheckTypes';
import type { VideoValidation } from './videoValidationTypes';
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
	descriptionPromptForInput,
	type DescriptionGenerationInput,
	type DescriptionGenerationResult
} from '../src/lib/description-generation';

const titleAiValidationBatchSize = 20;
const titleAiValidationMaxTokens = 4096;
const titleAlternativesMaxTokens = 2048;
const descriptionMaxTokens = 8192;

function titleAiValidationModel(provider: LlmProvider) {
	return provider.cacheConfigFor({
		task: 'titleChecks',
		maxTokens: titleAiValidationMaxTokens
	}).model;
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

async function titleAiValidationModelConfigHash(provider: LlmProvider) {
	return await sha256Hex(
		JSON.stringify(
			provider.cacheConfigFor({
				task: 'titleChecks',
				maxTokens: titleAiValidationMaxTokens
			})
		)
	);
}

function titleAiValidationInputKey(input: TitleAiValidationInput) {
	return `${input.videoId}:${input.field}:${input.checkId}:${JSON.stringify(input.input)}`;
}

function cacheKeyString(key: AiValidationCacheKey) {
	return [
		key.organizationId ?? 'legacy',
		key.videoId,
		key.field,
		key.checkId,
		key.inputHash,
		key.model,
		key.promptVersion,
		key.modelConfigHash
	].join(':');
}

async function aiValidationCacheKey(
	input: TitleAiValidationInput,
	provider: LlmProvider,
	organizationId: string
): Promise<AiValidationCacheKey> {
	const inputSnapshot = JSON.stringify(input.input);

	return {
		organizationId,
		videoId: input.videoId,
		field: input.field,
		checkId: input.checkId,
		inputHash: await sha256Hex(inputSnapshot),
		model: titleAiValidationModel(provider),
		promptVersion: titleAiValidationPromptVersion(input.checkId),
		modelConfigHash: await titleAiValidationModelConfigHash(provider)
	};
}

async function planTitleAiValidationCache(
	ctx: ActionCtx,
	inputs: TitleAiValidationInput[],
	provider: LlmProvider,
	organizationId: string
) {
	const entries = await Promise.all(
		inputs.map(async (input) => {
			const cacheKey = await aiValidationCacheKey(input, provider, organizationId);

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

async function validateTitleAiBatch(
	requests: TitleAiValidationRequest[],
	provider: LlmProvider
): Promise<TitleAiValidationResult> {
	const message = await provider.createMessage({
		task: 'titleChecks',
		prompt: buildTitleAiValidationPrompt(requests),
		maxTokens: titleAiValidationMaxTokens
	});

	if (message.error) {
		return {
			validationsByRequestId: {},
			error: message.error
		};
	}

	if (message.stopReason === 'max_tokens') {
		return {
			validationsByRequestId: {},
			error: 'Anthropic title validation response was truncated. Try a smaller batch.'
		};
	}

	try {
		const validationsByRequestId = parseTitleAiValidationResponse(message.text, requests);

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
	inputs: Array<TitleAiValidationInput & { requestId: string }>,
	provider: LlmProvider
): Promise<TitleAiValidationResult> {
	if (inputs.length === 0) {
		return { validationsByRequestId: {}, error: null };
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
		const result = await validateTitleAiBatch(batch, provider);

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

async function generateTitleAlternativesWithProvider(
	titleInput: TitleAlternativesInput,
	provider: LlmProvider
): Promise<TitleAlternativesResult> {
	if (titleInput.assignments.length === 0) {
		return { alternativesByAssignmentId: {}, error: null };
	}

	const message = await provider.createMessage({
		task: 'titleAlternatives',
		prompt: buildTitleAlternativesPrompt(titleInput),
		maxTokens: titleAlternativesMaxTokens
	});

	if (message.error) {
		return {
			alternativesByAssignmentId: fallbackAlternativesByAssignmentId(titleInput, message.error),
			error: message.error
		};
	}

	if (message.stopReason === 'max_tokens') {
		const error = 'Anthropic title alternatives response was truncated.';

		return {
			alternativesByAssignmentId: fallbackAlternativesByAssignmentId(titleInput, error),
			error
		};
	}

	try {
		return titleAlternativesFromResponse(titleInput, message.text);
	} catch {
		const error = 'Anthropic returned unreadable title alternatives.';

		return {
			alternativesByAssignmentId: fallbackAlternativesByAssignmentId(titleInput, error),
			error
		};
	}
}

async function generateDescriptionWithProvider(
	descriptionInput: DescriptionGenerationInput,
	provider: LlmProvider
): Promise<DescriptionGenerationResult> {
	const prompt = descriptionPromptForInput(descriptionInput);

	if (prompt.error) {
		return {
			description: null,
			error: prompt.error
		};
	}

	const message = await provider.createMessage({
		task: 'descriptionGeneration',
		prompt: prompt.prompt,
		maxTokens: descriptionMaxTokens
	});

	if (message.error) {
		return {
			description: null,
			error: message.error
		};
	}

	if (message.stopReason === 'max_tokens') {
		return {
			description: null,
			error: 'Anthropic description generation response was truncated.'
		};
	}

	try {
		return descriptionFromResponse(descriptionInput, message.text, message.model);
	} catch {
		return {
			description: null,
			error: 'Anthropic returned an unreadable description.'
		};
	}
}

export const validateTitleAiChecks = action({
	args: {
		inputs: v.array(titleAiValidationInputValidator)
	},
	handler: async (ctx, { inputs }): Promise<TitleAiValidationResult> => {
		await requireOrganizationId(ctx);

		return await validateTitleAiInputs(inputs, anthropicLlmProvider);
	}
});

export const collectCachedTitleAiChecks = action({
	args: {
		inputs: v.array(titleAiValidationCacheInputValidator)
	},
	handler: async (ctx, { inputs }) => {
		const organizationId = await requireOrganizationId(ctx);
		const cachePlan = await planTitleAiValidationCache(
			ctx,
			inputs,
			anthropicLlmProvider,
			organizationId
		);

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
		const organizationId = await requireOrganizationId(ctx);
		const cachePlan = await planTitleAiValidationCache(
			ctx,
			inputs,
			anthropicLlmProvider,
			organizationId
		);
		const freshResult = await validateTitleAiInputs(
			cachePlan.misses.map((entry) => ({
				requestId: entry.cacheKeyString,
				videoId: entry.videoId,
				field: entry.field,
				checkId: entry.checkId,
				label: entry.label,
				input: entry.input
			})),
			anthropicLlmProvider
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
	handler: async (ctx, { input }): Promise<TitleAlternativesResult> => {
		await requireOrganizationId(ctx);

		return await generateTitleAlternativesWithProvider(
			input as TitleAlternativesInput,
			anthropicLlmProvider
		);
	}
});

export const generateDescription = action({
	args: {
		input: v.any()
	},
	handler: async (ctx, { input }): Promise<DescriptionGenerationResult> => {
		await requireOrganizationId(ctx);

		return await generateDescriptionWithProvider(
			input as DescriptionGenerationInput,
			anthropicLlmProvider
		);
	}
});

export const generateDescriptionForJob = internalAction({
	args: {
		jobId: v.id('aiJobs')
	},
	handler: async (ctx, { jobId }): Promise<DescriptionGenerationResult> => {
		const context = await ctx.runQuery(
			internal.aiJobViews.getDescriptionGenerationContextInternal,
			{
				jobId
			}
		);

		if (!context.job) {
			return {
				description: null,
				error: context.error
			};
		}

		if (!context.input) {
			await ctx.runMutation(internal.aiJobCommands.recordDescriptionGenerationErrorInternal, {
				jobId,
				error: context.error ?? 'Description generation context is unavailable.'
			});

			return {
				description: null,
				error: context.error
			};
		}

		await ctx.runMutation(internal.aiJobCommands.recordDescriptionGenerationRunningInternal, {
			jobId
		});

		const result = await generateDescriptionWithProvider(context.input, anthropicLlmProvider);

		if (result.description) {
			await ctx.runMutation(internal.aiJobCommands.recordDescriptionGenerationCompleteInternal, {
				jobId,
				result: result.description
			});
		} else {
			await ctx.runMutation(internal.aiJobCommands.recordDescriptionGenerationErrorInternal, {
				jobId,
				error: result.error ?? 'Description generation failed.'
			});
		}

		return result;
	}
});
