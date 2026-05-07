import { v } from 'convex/values';
import { mutation } from './_generated/server';
import {
	documentBelongsToOrganization,
	requireDocumentInOrganization,
	requireOrganizationId
} from './authz';
import { upsertYoutubeChannel } from './youtubeChannelCommands';
import { titleValidationCheckIdValidator } from './titleValidationTypes';
import { validationStatValidator } from './videoValidationTypes';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

const playlistVideoSnapshotValidator = v.object({
	playlistItemId: v.string(),
	youtubeVideoId: v.string(),
	youtubeChannelId: v.optional(v.string()),
	title: v.string(),
	description: v.optional(v.string()),
	position: v.number(),
	videoUrl: v.string(),
	playlistVideoUrl: v.string(),
	studioEditUrl: v.string(),
	thumbnailUrl: v.optional(v.string()),
	channelTitle: v.optional(v.string()),
	publishedAt: v.optional(v.string()),
	videoPublishedAt: v.optional(v.string())
});

const videoTypeValidator = v.union(
	v.literal('talk'),
	v.literal('panelDiscussion'),
	v.literal('keynote'),
	v.literal('interview'),
	v.literal('custom')
);

function defaultVideoTypeForEventType(eventType: string | undefined) {
	return eventType === 'interviews' ? 'interview' : 'talk';
}

export const setMetadata = mutation({
	args: {
		videoId: v.id('videos'),
		clearTitleOverride: v.optional(v.boolean()),
		titleOverride: v.optional(v.string()),
		videoTitleFormat: v.optional(v.string()),
		videoType: v.optional(videoTypeValidator)
	},
	handler: async (ctx, { videoId, clearTitleOverride, titleOverride, ...fields }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await getVideoOrThrow(ctx, videoId, organizationId);
		await ctx.db.patch(video._id, {
			organizationId,
			...fields,
			...(titleOverride !== undefined ? { titleOverride } : {}),
			...(clearTitleOverride ? { titleOverride: undefined } : {})
		});

		return await ctx.db.get(video._id);
	}
});

export const recordTitle = mutation({
	args: {
		videoId: v.id('videos'),
		title: v.string()
	},
	handler: async (ctx, { videoId, title }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await getVideoOrThrow(ctx, videoId, organizationId);
		await ctx.db.patch(video._id, { organizationId, title });

		return await ctx.db.get(video._id);
	}
});

export const setDisabledTitleValidations = mutation({
	args: {
		videoId: v.id('videos'),
		disabledTitleValidationIds: v.array(titleValidationCheckIdValidator)
	},
	handler: async (ctx, { videoId, disabledTitleValidationIds }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await getVideoOrThrow(ctx, videoId, organizationId);
		const dedupedIds = [...new Set(disabledTitleValidationIds)];

		await ctx.db.patch(video._id, {
			organizationId,
			disabledTitleValidationIds: dedupedIds.length ? dedupedIds : undefined
		});

		return await ctx.db.get(video._id);
	}
});

export const recordYoutubeSnapshot = mutation({
	args: {
		videoId: v.id('videos'),
		youtubeVideoId: v.string(),
		youtubeChannelId: v.optional(v.string()),
		title: v.string(),
		description: v.optional(v.string()),
		videoUrl: v.string(),
		studioEditUrl: v.string(),
		thumbnailUrl: v.optional(v.string()),
		channelTitle: v.optional(v.string()),
		publishedAt: v.optional(v.string()),
		videoPublishedAt: v.optional(v.string())
	},
	handler: async (ctx, { videoId, youtubeVideoId, youtubeChannelId, ...fields }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await getVideoOrThrow(ctx, videoId, organizationId);

		if (video.youtubeVideoId !== youtubeVideoId) {
			throw new Error('YouTube snapshot does not match this video.');
		}

		await ctx.db.patch(video._id, {
			organizationId,
			youtubeVideoId,
			...(youtubeChannelId !== undefined ? { youtubeChannelId } : {}),
			...fields,
			lastFetchedAt: Date.now()
		});

		return await ctx.db.get(video._id);
	}
});

export const assignSpeaker = mutation({
	args: {
		videoId: v.id('videos'),
		speakerId: v.optional(v.id('speakers')),
		name: v.optional(v.string()),
		company: v.optional(v.string()),
		position: v.optional(v.string())
	},
	handler: async (ctx, { videoId, speakerId, name, company, position }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await getVideoOrThrow(ctx, videoId, organizationId);
		if (speakerId) {
			const speaker = await ctx.db.get(speakerId);

			requireDocumentInOrganization(speaker, organizationId, 'Speaker not found.');

			return await assignSpeakerToVideo(ctx, video._id, speakerId, organizationId);
		}

		if (!name) {
			throw new Error('Speaker name is required.');
		}

		const scopedSpeakers = await ctx.db
			.query('speakers')
			.withIndex('by_organizationId_and_name_and_company', (q) =>
				q.eq('organizationId', organizationId).eq('name', name)
			)
			.take(50);
		const legacySpeakers = await ctx.db
			.query('speakers')
			.withIndex('by_name_and_company', (q) => q.eq('name', name))
			.take(50);
		const existingSpeaker = [
			...legacySpeakers.filter((speaker) => !speaker.organizationId),
			...scopedSpeakers
		].find((speaker) => speaker.company === company && speaker.position === position);
		const resolvedSpeakerId = existingSpeaker
			? existingSpeaker._id
			: await ctx.db.insert('speakers', {
					organizationId,
					name,
					...(company !== undefined ? { company } : {}),
					...(position !== undefined ? { position } : {})
				});

		return await assignSpeakerToVideo(ctx, video._id, resolvedSpeakerId, organizationId);
	}
});

export const removeSpeaker = mutation({
	args: {
		videoId: v.id('videos'),
		speakerId: v.id('speakers')
	},
	handler: async (ctx, { videoId, speakerId }) => {
		const organizationId = await requireOrganizationId(ctx);
		const video = await getVideoOrThrow(ctx, videoId, organizationId);
		const assignment =
			(await ctx.db
				.query('videoSpeakers')
				.withIndex('by_organizationId_and_videoId_and_speakerId', (q) =>
					q.eq('organizationId', organizationId).eq('videoId', video._id).eq('speakerId', speakerId)
				)
				.unique()) ??
			(await ctx.db
				.query('videoSpeakers')
				.withIndex('by_videoId_and_speakerId', (q) =>
					q.eq('videoId', video._id).eq('speakerId', speakerId)
				)
				.unique());

		if (assignment && documentBelongsToOrganization(assignment, organizationId)) {
			await ctx.db.delete(assignment._id);
			return assignment;
		}

		return null;
	}
});

export const recordPlaylistSnapshotByEventId = mutation({
	args: {
		eventId: v.id('events'),
		playlist: v.object({
			playlistId: v.string(),
			youtubeChannelId: v.optional(v.string()),
			title: v.optional(v.string()),
			channelTitle: v.optional(v.string()),
			itemCount: v.optional(v.number()),
			validationContextKey: v.string(),
			validationStats: v.array(validationStatValidator),
			videos: v.array(playlistVideoSnapshotValidator)
		})
	},
	handler: async (ctx, { eventId, playlist }) => {
		const organizationId = await requireOrganizationId(ctx);
		const event = requireDocumentInOrganization(
			await ctx.db.get(eventId),
			organizationId,
			'Event not found.'
		);

		const lastFetchedAt = Date.now();
		const defaultVideoType = defaultVideoTypeForEventType(event.eventType);
		const videos = playlist.videos.slice(0, 500);
		if (playlist.youtubeChannelId) {
			await upsertYoutubeChannel(ctx, organizationId, {
				youtubeChannelId: playlist.youtubeChannelId,
				title: playlist.channelTitle ?? 'Untitled channel'
			});
			await ctx.db.patch(eventId, {
				organizationId,
				youtubeChannelId: playlist.youtubeChannelId
			});
		}
		const existingStats =
			(await ctx.db
				.query('eventPlaylistStats')
				.withIndex('by_organizationId_and_eventId', (q) =>
					q.eq('organizationId', organizationId).eq('eventId', eventId)
				)
				.unique()) ??
			(await ctx.db
				.query('eventPlaylistStats')
				.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
				.unique());
		const stats = {
			organizationId,
			...(playlist.youtubeChannelId !== undefined
				? { youtubeChannelId: playlist.youtubeChannelId }
				: {}),
			eventId,
			playlistId: playlist.playlistId,
			validationContextKey: playlist.validationContextKey,
			videoCount: videos.length,
			validationStats: playlist.validationStats,
			lastFetchedAt,
			...(playlist.title !== undefined ? { playlistTitle: playlist.title } : {}),
			...(playlist.channelTitle !== undefined
				? { playlistChannelTitle: playlist.channelTitle }
				: {}),
			...(playlist.itemCount !== undefined ? { playlistItemCount: playlist.itemCount } : {})
		};

		if (existingStats) {
			await ctx.db.replace(existingStats._id, stats);
		} else {
			await ctx.db.insert('eventPlaylistStats', stats);
		}

		const currentPlaylistItemIds = new Set(videos.map((video) => video.playlistItemId));
		const scopedAssignments = await ctx.db
			.query('playlistAssignments')
			.withIndex('by_organizationId_and_eventId', (q) =>
				q.eq('organizationId', organizationId).eq('eventId', eventId)
			)
			.take(500);
		const legacyAssignments = await ctx.db
			.query('playlistAssignments')
			.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
			.take(500);
		const existingAssignments = [
			...legacyAssignments.filter((assignment) => assignment.organizationId === undefined),
			...scopedAssignments
		];

		for (const assignment of existingAssignments) {
			if (
				assignment.playlistId !== playlist.playlistId ||
				!currentPlaylistItemIds.has(assignment.playlistItemId)
			) {
				await ctx.db.delete(assignment._id);
			}
		}

		for (const video of videos) {
			const videoId = await recordVideoSnapshot(
				ctx,
				video,
				lastFetchedAt,
				defaultVideoType,
				organizationId
			);
			const existingAssignment =
				(await ctx.db
					.query('playlistAssignments')
					.withIndex('by_organizationId_and_eventId_and_playlistId_and_playlistItemId', (q) =>
						q
							.eq('organizationId', organizationId)
							.eq('eventId', eventId)
							.eq('playlistId', playlist.playlistId)
							.eq('playlistItemId', video.playlistItemId)
					)
					.unique()) ??
				(await ctx.db
					.query('playlistAssignments')
					.withIndex('by_eventId_and_playlistId_and_playlistItemId', (q) =>
						q
							.eq('eventId', eventId)
							.eq('playlistId', playlist.playlistId)
							.eq('playlistItemId', video.playlistItemId)
					)
					.unique());
			const assignment = {
				organizationId,
				eventId,
				playlistId: playlist.playlistId,
				playlistItemId: video.playlistItemId,
				videoId,
				youtubeVideoId: video.youtubeVideoId,
				position: video.position,
				playlistVideoUrl: video.playlistVideoUrl,
				lastFetchedAt
			};

			if (existingAssignment) {
				await ctx.db.replace(existingAssignment._id, assignment);
			} else {
				await ctx.db.insert('playlistAssignments', assignment);
			}
		}

		return {
			videoCount: videos.length,
			lastFetchedAt
		};
	}
});

async function getVideoOrThrow(ctx: MutationCtx, videoId: Id<'videos'>, organizationId: string) {
	const video = await ctx.db.get(videoId);

	return requireDocumentInOrganization(video, organizationId, 'Video not found.');
}

async function assignSpeakerToVideo(
	ctx: MutationCtx,
	videoId: Id<'videos'>,
	speakerId: Id<'speakers'>,
	organizationId: string
) {
	const existingAssignment =
		(await ctx.db
			.query('videoSpeakers')
			.withIndex('by_organizationId_and_videoId_and_speakerId', (q) =>
				q.eq('organizationId', organizationId).eq('videoId', videoId).eq('speakerId', speakerId)
			)
			.unique()) ??
		(await ctx.db
			.query('videoSpeakers')
			.withIndex('by_videoId_and_speakerId', (q) =>
				q.eq('videoId', videoId).eq('speakerId', speakerId)
			)
			.unique());

	if (existingAssignment && documentBelongsToOrganization(existingAssignment, organizationId)) {
		return existingAssignment;
	}

	const scopedSpeakerAssignments = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_organizationId_and_videoId', (q) =>
			q.eq('organizationId', organizationId).eq('videoId', videoId)
		)
		.take(100);
	const legacySpeakerAssignments = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_videoId', (q) => q.eq('videoId', videoId))
		.take(100);
	const speakerAssignments = [
		...legacySpeakerAssignments.filter((assignment) => assignment.organizationId === undefined),
		...scopedSpeakerAssignments
	];
	const assignmentPosition =
		speakerAssignments.reduce((max, assignment) => Math.max(max, assignment.position), -1) + 1;

	const id = await ctx.db.insert('videoSpeakers', {
		organizationId,
		videoId,
		speakerId,
		position: assignmentPosition
	});

	return await ctx.db.get(id);
}

async function recordVideoSnapshot(
	ctx: MutationCtx,
	video: {
		youtubeVideoId: string;
		youtubeChannelId?: string;
		title: string;
		description?: string;
		videoUrl: string;
		studioEditUrl: string;
		thumbnailUrl?: string;
		channelTitle?: string;
		publishedAt?: string;
		videoPublishedAt?: string;
	},
	lastFetchedAt: number,
	defaultVideoType: 'talk' | 'interview',
	organizationId: string
) {
	const scopedVideo = await ctx.db
		.query('videos')
		.withIndex('by_organizationId_and_youtubeVideoId', (q) =>
			q.eq('organizationId', organizationId).eq('youtubeVideoId', video.youtubeVideoId)
		)
		.unique();
	const legacyVideos = scopedVideo
		? []
		: await ctx.db
				.query('videos')
				.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', video.youtubeVideoId))
				.take(10);
	const existingVideo =
		scopedVideo ?? legacyVideos.find((candidate) => candidate.organizationId === undefined);
	const snapshot = {
		organizationId,
		...(video.youtubeChannelId !== undefined ? { youtubeChannelId: video.youtubeChannelId } : {}),
		youtubeVideoId: video.youtubeVideoId,
		title: video.title,
		videoUrl: video.videoUrl,
		studioEditUrl: video.studioEditUrl,
		lastFetchedAt,
		...(video.description !== undefined ? { description: video.description } : {}),
		...(video.thumbnailUrl !== undefined ? { thumbnailUrl: video.thumbnailUrl } : {}),
		...(video.channelTitle !== undefined ? { channelTitle: video.channelTitle } : {}),
		...(video.publishedAt !== undefined ? { publishedAt: video.publishedAt } : {}),
		...(video.videoPublishedAt !== undefined ? { videoPublishedAt: video.videoPublishedAt } : {})
	};

	if (existingVideo) {
		requireDocumentInOrganization(existingVideo, organizationId, 'Video not found.');

		await ctx.db.replace(existingVideo._id, {
			...snapshot,
			...(existingVideo.videoTitleFormat !== undefined
				? { videoTitleFormat: existingVideo.videoTitleFormat }
				: {}),
			...(existingVideo.titleOverride !== undefined
				? { titleOverride: existingVideo.titleOverride }
				: {}),
			...(existingVideo.disabledTitleValidationIds !== undefined
				? { disabledTitleValidationIds: existingVideo.disabledTitleValidationIds }
				: {}),
			...(existingVideo.videoType !== undefined
				? { videoType: existingVideo.videoType }
				: { videoType: defaultVideoType })
		});
		return existingVideo._id;
	}

	return await ctx.db.insert('videos', {
		...snapshot,
		videoType: defaultVideoType
	});
}
