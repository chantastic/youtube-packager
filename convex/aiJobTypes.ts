import { v, type Infer } from 'convex/values';

export const descriptionGenerationTask = 'descriptionGeneration';

export const aiJobTaskValidator = v.literal(descriptionGenerationTask);

export const aiJobStatusValidator = v.union(
	v.literal('queued'),
	v.literal('running'),
	v.literal('complete'),
	v.literal('error')
);

export type AiJobTask = Infer<typeof aiJobTaskValidator>;
export type AiJobStatus = Infer<typeof aiJobStatusValidator>;
