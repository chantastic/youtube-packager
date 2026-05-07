import { v, type Infer } from 'convex/values';

export const validationStatusValidator = v.union(
	v.literal('pass'),
	v.literal('fail'),
	v.literal('info'),
	v.literal('pending')
);

export const videoValidationValidator = v.object({
	id: v.string(),
	label: v.string(),
	status: validationStatusValidator,
	message: v.string(),
	expected: v.optional(v.string()),
	details: v.optional(v.array(v.string())),
	suggested: v.optional(v.string())
});

export const validationStatValidator = v.object({
	id: v.string(),
	label: v.string(),
	passCount: v.number(),
	failCount: v.number(),
	infoCount: v.number(),
	pendingCount: v.optional(v.number())
});

export type ValidationStatus = Infer<typeof validationStatusValidator>;
export type VideoValidation = Infer<typeof videoValidationValidator>;
export type VideoValidationStat = Infer<typeof validationStatValidator>;
