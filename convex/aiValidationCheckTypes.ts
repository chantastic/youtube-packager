import { v, type Infer } from 'convex/values';
import { videoValidationValidator } from './videoValidationTypes';

export const aiValidationCacheKeyValidator = v.object({
	organizationId: v.optional(v.string()),
	videoId: v.string(),
	field: v.string(),
	checkId: v.string(),
	inputHash: v.string(),
	model: v.string(),
	promptVersion: v.string(),
	modelConfigHash: v.string()
});

export const aiValidationCheckWriteValidator = v.object({
	organizationId: v.optional(v.string()),
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

export type AiValidationCacheKey = Infer<typeof aiValidationCacheKeyValidator>;
export type AiValidationCheckWrite = Infer<typeof aiValidationCheckWriteValidator>;
