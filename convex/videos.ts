import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

const validationStatValidator = v.object({
	id: v.string(),
	label: v.string(),
	passCount: v.number(),
	failCount: v.number(),
	infoCount: v.number()
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

export const getByYoutubeVideoId = query({
	args: {
		youtubeVideoId: v.string()
	},
	handler: async (ctx, { youtubeVideoId }) => {
		return await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.unique();
	}
});

export const getViewByYoutubeVideoId = query({
	args: {
		youtubeVideoId: v.string()
	},
	handler: async (ctx, { youtubeVideoId }) => {
		const video = await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.unique();

		if (!video) {
			return null;
		}

		const assignments = await ctx.db
			.query('playlistAssignments')
			.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
			.take(100);
		const assignmentsWithEvents = [];
		const speakerAssignments = await ctx.db
			.query('videoSpeakers')
			.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
			.take(100);
		const speakers = [];

		for (const assignment of assignments) {
			const event = await ctx.db.get(assignment.eventId);

			if (event) {
				assignmentsWithEvents.push({ assignment, event });
			}
		}

		for (const speakerAssignment of speakerAssignments.sort((a, b) => a.position - b.position)) {
			const speaker = await ctx.db.get(speakerAssignment.speakerId);

			if (speaker) {
				speakers.push({ assignment: speakerAssignment, speaker });
			}
		}

		return {
			video,
			speakers,
			assignments: assignmentsWithEvents
		};
	}
});

export const getStatsByEventIds = query({
	args: {
		eventIds: v.array(v.id('events'))
	},
	handler: async (ctx, { eventIds }) => {
		const stats = [];

		for (const eventId of eventIds.slice(0, 100)) {
			const eventStats = await ctx.db
				.query('eventPlaylistStats')
				.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
				.unique();

			if (eventStats) {
				stats.push(eventStats);
			}
		}

		return stats;
	}
});

export const listAssignmentsByEvent = query({
	args: {
		eventId: v.id('events')
	},
	handler: async (ctx, { eventId }) => {
		const assignments = await ctx.db
			.query('playlistAssignments')
			.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
			.take(500);
		const rows = [];

		for (const assignment of assignments.sort((a, b) => a.position - b.position)) {
			const video = await ctx.db.get(assignment.videoId);

			if (video) {
				rows.push({ assignment, video });
			}
		}

		return rows;
	}
});

export const listAssignmentsByVideo = query({
	args: {
		videoId: v.id('videos')
	},
	handler: async (ctx, { videoId }) => {
		return await ctx.db
			.query('playlistAssignments')
			.withIndex('by_videoId', (q) => q.eq('videoId', videoId))
			.take(100);
	}
});

export const listSpeakers = query({
	args: {},
	handler: async (ctx) => {
		const speakers = await ctx.db.query('speakers').take(500);

		return speakers.sort((a, b) =>
			[a.name, a.company ?? '', a.position ?? '']
				.join(' ')
				.localeCompare([b.name, b.company ?? '', b.position ?? ''].join(' '))
		);
	}
});

export const updateMetadata = mutation({
	args: {
		youtubeVideoId: v.string(),
		videoTitleFormat: v.optional(v.string())
	},
	handler: async (ctx, { youtubeVideoId, ...fields }) => {
		const video = await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.unique();

		if (!video) {
			throw new Error('Video not found.');
		}

		await ctx.db.patch(video._id, fields);
	}
});

export const updateTitle = mutation({
	args: {
		youtubeVideoId: v.string(),
		title: v.string()
	},
	handler: async (ctx, { youtubeVideoId, title }) => {
		const video = await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.unique();

		if (!video) {
			throw new Error('Video not found.');
		}

		await ctx.db.patch(video._id, { title });
	}
});

export const addSpeaker = mutation({
	args: {
		youtubeVideoId: v.string(),
		speakerId: v.optional(v.id('speakers')),
		name: v.optional(v.string()),
		company: v.optional(v.string()),
		position: v.optional(v.string())
	},
	handler: async (ctx, { youtubeVideoId, speakerId, name, company, position }) => {
		const video = await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.unique();

		if (!video) {
			throw new Error('Video not found.');
		}

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
		youtubeVideoId: v.string(),
		speakerId: v.id('speakers')
	},
	handler: async (ctx, { youtubeVideoId, speakerId }) => {
		const video = await ctx.db
			.query('videos')
			.withIndex('by_youtubeVideoId', (q) => q.eq('youtubeVideoId', youtubeVideoId))
			.unique();

		if (!video) {
			throw new Error('Video not found.');
		}

		const assignment = await ctx.db
			.query('videoSpeakers')
			.withIndex('by_videoId_and_speakerId', (q) =>
				q.eq('videoId', video._id).eq('speakerId', speakerId)
			)
			.unique();

		if (assignment) {
			await ctx.db.delete(assignment._id);
		}
	}
});

export const syncPlaylistForEvent = mutation({
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
			const videoId = await upsertVideo(ctx, video, lastFetchedAt);
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
		return existingAssignment._id;
	}

	const speakerAssignments = await ctx.db
		.query('videoSpeakers')
		.withIndex('by_videoId', (q) => q.eq('videoId', videoId))
		.take(100);
	const assignmentPosition =
		speakerAssignments.reduce((max, assignment) => Math.max(max, assignment.position), -1) + 1;

	return await ctx.db.insert('videoSpeakers', {
		videoId,
		speakerId,
		position: assignmentPosition
	});
}

async function upsertVideo(
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
	lastFetchedAt: number
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
				: {})
		});
		return existingVideo._id;
	}

	return await ctx.db.insert('videos', snapshot);
}
