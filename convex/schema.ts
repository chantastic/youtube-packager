import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	events: defineTable({
		name: v.string(),
		year: v.optional(v.number()),
		titleFormat: v.optional(v.string()),
		youtubePlaylistId: v.optional(v.string())
	}),
	titleQualityChecks: defineTable({
		videoId: v.string(),
		titleHash: v.string(),
		title: v.string(),
		model: v.string(),
		validationVersion: v.string(),
		validations: v.array(
			v.object({
				id: v.string(),
				label: v.string(),
				status: v.union(v.literal('pass'), v.literal('fail'), v.literal('info')),
				message: v.string(),
				expected: v.optional(v.string()),
				details: v.optional(v.array(v.string())),
				suggested: v.optional(v.string())
			})
		),
		checkedAt: v.number()
	}).index('by_videoId_and_titleHash_and_model_and_validationVersion', [
		'videoId',
		'titleHash',
		'model',
		'validationVersion'
	])
});
