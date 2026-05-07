import { v, type Infer } from 'convex/values';
import { videoValidationValidator } from './videoValidationTypes';

export const aiValidationCacheKeyInputValidator = v.object({
	videoId: v.string(),
	field: v.string(),
	checkId: v.string(),
	inputHash: v.string(),
	model: v.string(),
	promptVersion: v.string(),
	modelConfigHash: v.string()
});

export const aiValidationCacheKeyValidator = v.object({
	organizationId: v.string(),
	videoId: v.string(),
	field: v.string(),
	checkId: v.string(),
	inputHash: v.string(),
	model: v.string(),
	promptVersion: v.string(),
	modelConfigHash: v.string()
});

export const aiValidationCheckWriteInputValidator = v.object({
	videoId: v.string(),
	field: v.string(),
	checkId: v.string(),
	inputHash: v.string(),
	inputSnapshot: v.string(),
	model: v.string(),
	promptVersion: v.string(),
	modelConfigHash: v.string(),
	validation: videoValidationValidator,
	checkedAt: v.number()
});

export const aiValidationCheckWriteValidator = v.object({
	organizationId: v.string(),
	videoId: v.string(),
	field: v.string(),
	checkId: v.string(),
	inputHash: v.string(),
	inputSnapshot: v.string(),
	model: v.string(),
	promptVersion: v.string(),
	modelConfigHash: v.string(),
	validation: videoValidationValidator,
	checkedAt: v.number()
});

export type AiValidationCacheKeyInput = Infer<typeof aiValidationCacheKeyInputValidator>;
export type AiValidationCacheKey = Infer<typeof aiValidationCacheKeyValidator>;
export type AiValidationCheckWriteInput = Infer<typeof aiValidationCheckWriteInputValidator>;
export type AiValidationCheckWrite = Infer<typeof aiValidationCheckWriteValidator>;
