import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { aiJobStatusValidator, aiJobTaskValidator } from './aiJobTypes';
import { generatedDescriptionValidator } from './descriptionGenerationTypes';
import { titleValidationCheckIdValidator } from './titleValidationTypes';
import { videoValidationValidator, validationStatValidator } from './videoValidationTypes';

export default defineSchema({
	events: defineTable({
		name: v.string(),
		editionTitle: v.optional(v.string()),
		eventType: v.optional(v.union(v.literal('conference'), v.literal('interviews'))),
		year: v.optional(v.number()),
		titleFormat: v.optional(v.string()),
		youtubePlaylistId: v.optional(v.string())
	}),
	videos: defineTable({
		youtubeVideoId: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		titleOverride: v.optional(v.string()),
		disabledTitleValidationIds: v.optional(v.array(titleValidationCheckIdValidator)),
		videoTitleFormat: v.optional(v.string()),
		videoType: v.optional(
			v.union(
				v.literal('talk'),
				v.literal('panelDiscussion'),
				v.literal('keynote'),
				v.literal('interview'),
				v.literal('custom')
			)
		),
		videoUrl: v.string(),
		studioEditUrl: v.string(),
		thumbnailUrl: v.optional(v.string()),
		channelTitle: v.optional(v.string()),
		publishedAt: v.optional(v.string()),
		videoPublishedAt: v.optional(v.string()),
		lastFetchedAt: v.number()
	}).index('by_youtubeVideoId', ['youtubeVideoId']),
	speakers: defineTable({
		name: v.string(),
		company: v.optional(v.string()),
		position: v.optional(v.string())
	}).index('by_name_and_company', ['name', 'company']),
	videoSpeakers: defineTable({
		videoId: v.id('videos'),
		speakerId: v.id('speakers'),
		position: v.number()
	})
		.index('by_videoId', ['videoId'])
		.index('by_videoId_and_speakerId', ['videoId', 'speakerId'])
		.index('by_speakerId', ['speakerId']),
	videoCaptions: defineTable({
		videoId: v.id('videos'),
		youtubeVideoId: v.string(),
		captionTrackId: v.string(),
		language: v.optional(v.string()),
		name: v.optional(v.string()),
		trackKind: v.optional(v.string()),
		isAutoSynced: v.optional(v.boolean()),
		status: v.optional(v.string()),
		format: v.literal('srt'),
		body: v.string(),
		fetchedAt: v.number()
	})
		.index('by_videoId', ['videoId'])
		.index('by_videoId_and_captionTrackId', ['videoId', 'captionTrackId'])
		.index('by_youtubeVideoId', ['youtubeVideoId'])
		.index('by_youtubeVideoId_and_captionTrackId', ['youtubeVideoId', 'captionTrackId']),
	playlistAssignments: defineTable({
		eventId: v.id('events'),
		playlistId: v.string(),
		playlistItemId: v.string(),
		videoId: v.id('videos'),
		youtubeVideoId: v.string(),
		position: v.number(),
		playlistVideoUrl: v.string(),
		lastFetchedAt: v.number()
	})
		.index('by_eventId', ['eventId'])
		.index('by_eventId_and_playlistId', ['eventId', 'playlistId'])
		.index('by_eventId_and_playlistId_and_playlistItemId', [
			'eventId',
			'playlistId',
			'playlistItemId'
		])
		.index('by_videoId', ['videoId'])
		.index('by_playlistId', ['playlistId'])
		.index('by_playlistId_and_playlistItemId', ['playlistId', 'playlistItemId']),
	eventPlaylistStats: defineTable({
		eventId: v.id('events'),
		playlistId: v.string(),
		playlistTitle: v.optional(v.string()),
		playlistChannelTitle: v.optional(v.string()),
		playlistItemCount: v.optional(v.number()),
		validationContextKey: v.optional(v.string()),
		videoCount: v.number(),
		validationStats: v.array(validationStatValidator),
		lastFetchedAt: v.number()
	}).index('by_eventId', ['eventId']),
	youtubeConnections: defineTable({
		userId: v.string(),
		organizationId: v.optional(v.string()),
		organizationKey: v.string(),
		refreshTokenCiphertext: v.string(),
		refreshTokenIv: v.string(),
		scopes: v.array(v.string()),
		tokenType: v.optional(v.string()),
		status: v.union(v.literal('active'), v.literal('needs_reauthorization')),
		lastError: v.optional(v.string()),
		connectedAt: v.number(),
		updatedAt: v.number()
	}).index('by_userId_and_organizationKey', ['userId', 'organizationKey']),
	aiValidationChecks: defineTable({
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
	}).index('by_cache_key', [
		'videoId',
		'field',
		'checkId',
		'inputHash',
		'model',
		'promptVersion',
		'modelConfigHash'
	]),
	aiJobs: defineTable({
		task: aiJobTaskValidator,
		status: aiJobStatusValidator,
		videoId: v.id('videos'),
		captionId: v.optional(v.id('videoCaptions')),
		result: v.optional(generatedDescriptionValidator),
		error: v.optional(v.string()),
		queuedAt: v.number(),
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		updatedAt: v.number()
	}).index('by_task_and_videoId_and_queuedAt', ['task', 'videoId', 'queuedAt'])
});
