import { getConvexClient } from '$lib/server/convex';
import type { TitleAiValidationInput } from '$lib/title-ai-validation';
import type { VideoValidation } from '$lib/video-validation';
import {
	titleAiValidationModel,
	titleAiValidationModelConfigHash,
	titleAiValidationPromptVersion
} from '$lib/server/anthropic-title-validation';
import { api } from '../../../convex/_generated/api';

export type AiValidationCacheKey = {
	videoId: string;
	field: string;
	checkId: string;
	inputHash: string;
	model: string;
	promptVersion: string;
	modelConfigHash: string;
};

export type AiValidationCacheEntry = TitleAiValidationInput & {
	cacheKey: AiValidationCacheKey;
	cacheKeyString: string;
	inputSnapshot: string;
};

export type AiValidationCachePlan = {
	entries: AiValidationCacheEntry[];
	cachedValidationsByCacheKey: Record<string, VideoValidation>;
	cachedValidationsByVideoId: Record<string, VideoValidation[]>;
	misses: AiValidationCacheEntry[];
};

async function sha256Hex(value: string) {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);

	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
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

export async function aiValidationCacheKey(
	input: TitleAiValidationInput
): Promise<AiValidationCacheKey> {
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

export async function planAiValidationCache(
	inputs: TitleAiValidationInput[]
): Promise<AiValidationCachePlan> {
	const entries = await Promise.all(
		inputs.map(async (input) => {
			const cacheKey = await aiValidationCacheKey(input);

			return {
				...input,
				cacheKey,
				cacheKeyString: cacheKeyString(cacheKey),
				inputSnapshot: JSON.stringify(input.input)
			};
		})
	);
	const cached = await getConvexClient().query(api.aiValidationChecks.collectByCacheKey, {
		keys: entries.map((entry) => entry.cacheKey)
	});
	const cachedByKey = new Map(cached.map((check) => [cacheKeyString(check), check.validation]));
	const cachedValidationsByCacheKey: Record<string, VideoValidation> = {};
	const cachedValidationsByVideoId: Record<string, VideoValidation[]> = {};
	const misses: AiValidationCacheEntry[] = [];

	for (const entry of entries) {
		const cachedValidation = cachedByKey.get(entry.cacheKeyString);

		if (cachedValidation) {
			cachedValidationsByCacheKey[entry.cacheKeyString] = cachedValidation;
			cachedValidationsByVideoId[entry.videoId] = [
				...(cachedValidationsByVideoId[entry.videoId] ?? []),
				cachedValidation
			];
		} else {
			misses.push(entry);
		}
	}

	return {
		entries,
		cachedValidationsByCacheKey,
		cachedValidationsByVideoId,
		misses
	};
}

export async function saveAiValidationCache(
	entries: Array<AiValidationCacheEntry & { validation: VideoValidation; checkedAt: number }>
) {
	if (entries.length === 0) {
		return;
	}

	await getConvexClient().mutation(api.aiValidationChecks.upsertMany, {
		checks: entries.map((entry) => ({
			...entry.cacheKey,
			inputSnapshot: entry.inputSnapshot,
			validation: entry.validation,
			checkedAt: entry.checkedAt
		}))
	});
}
