import { error } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import { getPublicPlaylistData, YouTubePublicApiError } from '$lib/server/youtube-public';
import {
	summarizeVideoValidations,
	validateVideoBaseline,
	videoValidationContextKey
} from '$lib/video-validation';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const client = getConvexClient();
	const event = await client.query(api.events.get, {
		id: params.id as Id<'events'>
	});

	if (!event) {
		throw error(404, 'Event not found.');
	}

	if (!event.youtubePlaylistId) {
		return {
			event,
			playlist: null,
			playlistError: null,
			titleQualityValidationsByVideoId: {},
			titleQualityError: null
		};
	}

	try {
		const playlist = await getPublicPlaylistData(event.youtubePlaylistId);
		const validationStats = summarizeVideoValidations(
			playlist.videos.map((video) => validateVideoBaseline(video.title, event))
		);

		await client.mutation(api.videos.syncPlaylistForEvent, {
			eventId: event._id,
			playlist: {
				playlistId: playlist.playlistId,
				...(playlist.title !== undefined ? { title: playlist.title } : {}),
				...(playlist.channelTitle !== undefined ? { channelTitle: playlist.channelTitle } : {}),
				...(playlist.itemCount !== undefined ? { itemCount: playlist.itemCount } : {}),
				validationContextKey: videoValidationContextKey(event),
				validationStats,
				videos: playlist.videos.map((video) => ({
					playlistItemId: video.playlistItemId,
					youtubeVideoId: video.videoId,
					title: video.title,
					position: video.position,
					videoUrl: video.videoUrl,
					playlistVideoUrl: video.playlistVideoUrl,
					studioEditUrl: video.studioEditUrl,
					...(video.description !== undefined ? { description: video.description } : {}),
					...(video.thumbnailUrl !== undefined ? { thumbnailUrl: video.thumbnailUrl } : {}),
					...(video.channelTitle !== undefined ? { channelTitle: video.channelTitle } : {}),
					...(video.publishedAt !== undefined ? { publishedAt: video.publishedAt } : {}),
					...(video.videoPublishedAt !== undefined
						? { videoPublishedAt: video.videoPublishedAt }
						: {})
				}))
			}
		});

		return {
			event,
			playlist,
			playlistError: null,
			titleQualityValidationsByVideoId: {},
			titleQualityError: null
		};
	} catch (err) {
		if (err instanceof YouTubePublicApiError) {
			return {
				event,
				playlist: null,
				playlistError: {
					status: err.status,
					message: err.message
				},
				titleQualityValidationsByVideoId: {},
				titleQualityError: null
			};
		}

		throw err;
	}
};
