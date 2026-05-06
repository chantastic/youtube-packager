import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	events: defineTable({
		name: v.string(),
		year: v.optional(v.number()),
		titleFormat: v.optional(v.string()),
		youtubePlaylistId: v.optional(v.string())
	}),
	videos: defineTable({
		youtubeVideoId: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		videoTitleFormat: v.optional(v.string()),
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
		validationStats: v.array(
			v.object({
				id: v.string(),
				label: v.string(),
				passCount: v.number(),
				failCount: v.number(),
				infoCount: v.number()
			})
		),
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
