import { error, fail } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import {
	getConnectedYouTubeAccessToken,
	YouTubeConnectionError,
	youtubeAuthContext
} from '$lib/server/youtube-connection';
import { getYouTubePlaylistData, YouTubeDataApiError } from '$lib/server/youtube-data-api';
import { isVideoType, normalizeVideoType } from '$lib/title-format';
import {
	summarizeVideoValidations,
	validateVideoBaseline,
	videoValidationContextKey
} from '$lib/video-validation';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import type { Actions, PageServerLoad } from './$types';

function optionalString(data: FormData, key: string) {
	const value = data.get(key);
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const auth = youtubeAuthContext({ locals });
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
			playlistAssignments: [],
			playlistError: null,
			titleQualityValidationsByVideoId: {},
			titleQualityError: null
		};
	}

	try {
		const accessToken = await getConnectedYouTubeAccessToken(auth);
		const playlist = await getYouTubePlaylistData(event.youtubePlaylistId, accessToken);
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
		const playlistAssignments = await client.query(api.videos.listAssignmentsByEvent, {
			eventId: event._id
		});

		return {
			event,
			playlist,
			playlistAssignments,
			playlistError: null,
			titleQualityValidationsByVideoId: {},
			titleQualityError: null
		};
	} catch (err) {
		if (err instanceof YouTubeDataApiError || err instanceof YouTubeConnectionError) {
			return {
				event,
				playlist: null,
				playlistAssignments: [],
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

export const actions: Actions = {
	updateVideoType: async ({ request }) => {
		const data = await request.formData();
		const youtubeVideoId = optionalString(data, 'youtubeVideoId');
		const videoType = optionalString(data, 'videoType');

		if (!youtubeVideoId || !isVideoType(videoType)) {
			return fail(400, {
				videoTypeError: 'Choose a valid video type.'
			});
		}

		await getConvexClient().mutation(api.videos.updateMetadata, {
			youtubeVideoId,
			videoType: normalizeVideoType(videoType)
		});

		return {
			videoTypeMessage: 'Video type updated.',
			videoTypeVideoId: youtubeVideoId
		};
	}
};
