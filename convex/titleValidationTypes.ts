import { v, type Infer } from 'convex/values';

export const titleValidationCheckIdValidator = v.union(
	v.literal('hook'),
	v.literal('profile'),
	v.literal('event'),
	v.literal('format'),
	v.literal('mechanics')
);

export type TitleValidationCheckId = Infer<typeof titleValidationCheckIdValidator>;
