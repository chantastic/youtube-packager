import { v } from 'convex/values';
import { mutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

const validationStatValidator = v.object({
	id: v.string(),
	label: v.string(),
	passCount: v.number(),
	failCount: v.number(),
	infoCount: v.number(),
	pendingCount: v.optional(v.number())
});

const playlistVideoSnapshotValidator = v.object({
	playlistItemId: v.string(),
	youtubeVideoId: v.string(),
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
	v.literal('presentation'),
	v.literal('panelDiscussion'),
	v.literal('keynote'),
	v.literal('demo'),
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
		const video = await getVideoOrThrow(ctx, videoId);
		await ctx.db.patch(video._id, {
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
		const video = await getVideoOrThrow(ctx, videoId);
		await ctx.db.patch(video._id, { title });

		return await ctx.db.get(video._id);
	}
});

export const recordYoutubeSnapshot = mutation({
	args: {
		videoId: v.id('videos'),
		youtubeVideoId: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		videoUrl: v.string(),
		studioEditUrl: v.string(),
		thumbnailUrl: v.optional(v.string()),
		channelTitle: v.optional(v.string()),
		publishedAt: v.optional(v.string()),
		videoPublishedAt: v.optional(v.string())
	},
	handler: async (ctx, { videoId, youtubeVideoId, ...fields }) => {
		const video = await getVideoOrThrow(ctx, videoId);

		if (video.youtubeVideoId !== youtubeVideoId) {
			throw new Error('YouTube snapshot does not match this video.');
		}

		await ctx.db.patch(video._id, {
			youtubeVideoId,
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
		const video = await getVideoOrThrow(ctx, videoId);
		if (speakerId) {
			const speaker = await ctx.db.get(speakerId);

			if (!speaker) {
				throw new Error('Speaker not found.');
			}

			return await assignSpeakerToVideo(ctx, video._id, speakerId);
		}

		if (!name) {
			throw new Error('Speaker name is required.');
		}

		const existingSpeakers = await ctx.db
			.query('speakers')
			.withIndex('by_name_and_company', (q) => q.eq('name', name))
			.take(50);
		const existingSpeaker = existingSpeakers.find(
			(speaker) => speaker.company === company && speaker.position === position
		);
		const resolvedSpeakerId = existingSpeaker
			? existingSpeaker._id
			: await ctx.db.insert('speakers', {
					name,
					...(company !== undefined ? { company } : {}),
					...(position !== undefined ? { position } : {})
				});

		return await assignSpeakerToVideo(ctx, video._id, resolvedSpeakerId);
	}
});

export const removeSpeaker = mutation({
	args: {
		videoId: v.id('videos'),
		speakerId: v.id('speakers')
	},
	handler: async (ctx, { videoId, speakerId }) => {
		const video = await getVideoOrThrow(ctx, videoId);
		const assignment = await ctx.db
			.query('videoSpeakers')
			.withIndex('by_videoId_and_speakerId', (q) =>
				q.eq('videoId', video._id).eq('speakerId', speakerId)
			)
			.unique();

		if (assignment) {
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
			title: v.optional(v.string()),
			channelTitle: v.optional(v.string()),
			itemCount: v.optional(v.number()),
			validationContextKey: v.string(),
			validationStats: v.array(validationStatValidator),
			videos: v.array(playlistVideoSnapshotValidator)
		})
	},
	handler: async (ctx, { eventId, playlist }) => {
		const event = await ctx.db.get(eventId);

		if (!event) {
			throw new Error('Event not found.');
		}

		const lastFetchedAt = Date.now();
		const defaultVideoType = defaultVideoTypeForEventType(event.eventType);
		const videos = playlist.videos.slice(0, 500);
		const existingStats = await ctx.db
			.query('eventPlaylistStats')
			.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
			.unique();
		const stats = {
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
		const existingAssignments = await ctx.db
			.query('playlistAssignments')
			.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
			.take(500);

		for (const assignment of existingAssignments) {
			if (
				assignment.playlistId !== playlist.playlistId ||
				!currentPlaylistItemIds.has(assignment.playlistItemId)
			) {
				await ctx.db.delete(assignment._id);
			}
		}

		for (const video of videos) {
			const videoId = await recordVideoSnapshot(ctx, video, lastFetchedAt, defaultVideoType);
			const existingAssignment = await ctx.db
				.query('playlistAssignments')
				.withIndex('by_eventId_and_playlistId_and_playlistItemId', (q) =>
					q
						.eq('eventId', eventId)
						.eq('playlistId', playlist.playlistId)
						.eq('playlistItemId', video.playlistItemId)
				)
				.unique();
			const assignment = {
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

async function getVideoOrThrow(ctx: MutationCtx, videoId: Id<'videos'>) {
	const video = await ctx.db.get(videoId);

	if (!video) {
		throw new Error('Video not found.');
	}

	return video;
}

async function assignSpeakerToVideo(
	ctx: MutationCtx,
	videoId: Id<'videos'>,
	speakerId: Id<'speakers'>
) {
	const existingAssignment = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_videoId_and_speakerId', (q) =>
			q.eq('videoId', videoId).eq('speakerId', speakerId)
		)
		.unique();

	if (existingAssignment) {
		return existingAssignment;
	}

	const speakerAssignments = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_videoId', (q) => q.eq('videoId', videoId))
		.take(100);
	const assignmentPosition =
		speakerAssignments.reduce((max, assignment) => Math.max(max, assignment.position), -1) + 1;

	const id = await ctx.db.insert('videoSpeakers', {
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
	defaultVideoType: 'talk' | 'interview'
) {
	const existingVideo = await ctx.db
		.query('videos')
		.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', video.youtubeVideoId))
		.unique();
	const snapshot = {
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
		await ctx.db.replace(existingVideo._id, {
			...snapshot,
			...(existingVideo.videoTitleFormat !== undefined
				? { videoTitleFormat: existingVideo.videoTitleFormat }
				: {}),
			...(existingVideo.titleOverride !== undefined
				? { titleOverride: existingVideo.titleOverride }
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
