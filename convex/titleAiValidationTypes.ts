import { v, type Infer } from 'convex/values';
import type { AiValidationCacheKey } from './aiValidationCheckTypes';
import type { VideoValidation } from './videoValidationTypes';

export const titleAiValidationCheckIdValidator = v.union(v.literal('hook'), v.literal('mechanics'));

export type TitleAiValidationCheckId = Infer<typeof titleAiValidationCheckIdValidator>;

export const titleAiPromptVersions = {
	hook: 'title-hook-v1',
	mechanics: 'title-mechanics-v1'
} as const satisfies Record<TitleAiValidationCheckId, string>;

export const titleAiValidationCacheInputValidator = v.object({
	videoId: v.string(),
	field: v.string(),
	checkId: titleAiValidationCheckIdValidator,
	label: v.string(),
	input: v.any()
});

export const titleAiValidationInputValidator = v.object({
	requestId: v.string(),
	videoId: v.string(),
	field: v.string(),
	checkId: titleAiValidationCheckIdValidator,
	label: v.string(),
	input: v.any()
});

type TitleAiValidationCacheInputShape = Infer<typeof titleAiValidationCacheInputValidator>;

export type TitleAiValidationInput = Omit<TitleAiValidationCacheInputShape, 'input'> & {
	input: unknown;
};

export type TitleAiValidationRequest = {
	requestId: string;
	videoId: string;
	checkId: TitleAiValidationCheckId;
	label: string;
	input: unknown;
};

export type AiValidationCacheEntry = TitleAiValidationInput & {
	cacheKey: AiValidationCacheKey;
	cacheKeyString: string;
	inputKey: string;
	inputSnapshot: string;
};

export type TitleAiValidationItem = {
	requestId?: string;
	status?: 'pass' | 'fail' | 'info';
	message?: string;
	details?: string[];
	suggested?: string;
};

export type TitleAiValidationResult = {
	validationsByRequestId: Record<string, VideoValidation>;
	error: string | null;
};
