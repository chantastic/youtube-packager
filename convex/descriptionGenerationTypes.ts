import { v, type Infer } from 'convex/values';

export const descriptionLinkValidator = v.object({
	label: v.string(),
	url: v.optional(v.string()),
	placeholder: v.optional(v.string())
});

export const generatedDescriptionValidator = v.object({
	hook: v.string(),
	metadata: v.array(
		v.object({
			label: v.string(),
			value: v.string()
		})
	),
	chapters: v.array(
		v.object({
			timestamp: v.string(),
			title: v.string()
		})
	),
	links: v.array(descriptionLinkValidator),
	description: v.string(),
	model: v.string(),
	chapterTarget: v.number(),
	durationSeconds: v.number()
});

export type GeneratedDescription = Infer<typeof generatedDescriptionValidator>;
