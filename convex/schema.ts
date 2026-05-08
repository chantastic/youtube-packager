import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { aiJobStatusValidator, aiJobTaskValidator } from './aiJobTypes';
import { generatedDescriptionValidator } from './descriptionGenerationTypes';
import { titleValidationCheckIdValidator } from './titleValidationTypes';
import { videoValidationValidator, validationStatValidator } from './videoValidationTypes';
import {
	workflowJobEntityTypeValidator,
	workflowJobStatusValidator,
	workflowJobTaskValidator
} from './workflowJobTypes';

export default defineSchema({
	organizations: defineTable({
		workosOrganizationId: v.string(),
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_workosOrganizationId', ['workosOrganizationId']),
	youtubeChannels: defineTable({
		organizationId: v.string(),
		youtubeChannelId: v.string(),
		title: v.string(),
		handle: v.optional(v.string()),
		thumbnailUrl: v.optional(v.string()),
		uploadsPlaylistId: v.optional(v.string()),
		connectedAt: v.number(),
		lastSeenAt: v.number()
	})
		.index('by_organizationId', ['organizationId'])
		.index('by_organizationId_and_youtubeChannelId', ['organizationId', 'youtubeChannelId']),
	events: defineTable({
		organizationId: v.string(),
		youtubeChannelId: v.optional(v.string()),
		name: v.string(),
		editionTitle: v.optional(v.string()),
		eventType: v.optional(v.union(v.literal('conference'), v.literal('interviews'))),
		year: v.optional(v.number()),
		titleFormat: v.optional(v.string()),
		enabledTitleValidationIds: v.optional(v.array(titleValidationCheckIdValidator)),
		youtubePlaylistId: v.optional(v.string())
	}).index('by_organizationId', ['organizationId']),
	videos: defineTable({
		organizationId: v.string(),
		youtubeChannelId: v.optional(v.string()),
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
	}).index('by_organizationId_and_youtubeVideoId', ['organizationId', 'youtubeVideoId']),
	speakers: defineTable({
		organizationId: v.string(),
		name: v.string(),
		company: v.optional(v.string()),
		position: v.optional(v.string())
	}).index('by_organizationId_and_name_and_company', ['organizationId', 'name', 'company']),
	videoSpeakers: defineTable({
		organizationId: v.string(),
		videoId: v.id('videos'),
		speakerId: v.id('speakers'),
		position: v.number()
	})
		.index('by_organizationId_and_videoId', ['organizationId', 'videoId'])
		.index('by_organizationId_and_videoId_and_speakerId', [
			'organizationId',
			'videoId',
			'speakerId'
		]),
	videoCaptions: defineTable({
		organizationId: v.string(),
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
		.index('by_organizationId_and_videoId', ['organizationId', 'videoId'])
		.index('by_organizationId_and_videoId_and_captionTrackId', [
			'organizationId',
			'videoId',
			'captionTrackId'
		]),
	playlistAssignments: defineTable({
		organizationId: v.string(),
		eventId: v.id('events'),
		playlistId: v.string(),
		playlistItemId: v.string(),
		videoId: v.id('videos'),
		youtubeVideoId: v.string(),
		position: v.number(),
		playlistVideoUrl: v.string(),
		lastFetchedAt: v.number()
	})
		.index('by_organizationId_and_eventId', ['organizationId', 'eventId'])
		.index('by_organizationId_and_videoId', ['organizationId', 'videoId'])
		.index('by_organizationId_and_eventId_and_playlistId_and_playlistItemId', [
			'organizationId',
			'eventId',
			'playlistId',
			'playlistItemId'
		]),
	eventPlaylistStats: defineTable({
		organizationId: v.string(),
		youtubeChannelId: v.optional(v.string()),
		eventId: v.id('events'),
		playlistId: v.string(),
		playlistTitle: v.optional(v.string()),
		playlistChannelTitle: v.optional(v.string()),
		playlistItemCount: v.optional(v.number()),
		validationContextKey: v.optional(v.string()),
		videoCount: v.number(),
		validationStats: v.optional(v.array(validationStatValidator)),
		lastFetchedAt: v.number()
	}).index('by_organizationId_and_eventId', ['organizationId', 'eventId']),
	aiValidationChecks: defineTable({
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
	}).index('by_organizationId_and_cache_key', [
		'organizationId',
		'videoId',
		'field',
		'checkId',
		'inputHash',
		'model',
		'promptVersion',
		'modelConfigHash'
	]),
	aiJobs: defineTable({
		organizationId: v.string(),
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
	}).index('by_organizationId_and_task_and_videoId_and_queuedAt', [
		'organizationId',
		'task',
		'videoId',
		'queuedAt'
	]),
	workflowJobs: defineTable({
		organizationId: v.string(),
		requestedByUserId: v.string(),
		task: workflowJobTaskValidator,
		status: workflowJobStatusValidator,
		key: v.string(),
		entityType: workflowJobEntityTypeValidator,
		eventId: v.optional(v.id('events')),
		videoId: v.optional(v.id('videos')),
		input: v.optional(v.string()),
		result: v.optional(v.string()),
		error: v.optional(v.string()),
		queuedAt: v.number(),
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		updatedAt: v.number()
	})
		.index('by_organizationId_and_task_and_key_and_queuedAt', [
			'organizationId',
			'task',
			'key',
			'queuedAt'
		])
		.index('by_organizationId_and_eventId_and_task_and_queuedAt', [
			'organizationId',
			'eventId',
			'task',
			'queuedAt'
		])
		.index('by_organizationId_and_videoId_and_task_and_queuedAt', [
			'organizationId',
			'videoId',
			'task',
			'queuedAt'
		])
});
