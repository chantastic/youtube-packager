import { error } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import { getPublicPlaylistData, YouTubePublicApiError } from '$lib/server/youtube-public';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const event = await getConvexClient().query(api.events.get, {
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
