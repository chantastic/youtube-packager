import { error } from '@sveltejs/kit';
import { convexAdminFunction, getConvexClient } from '$lib/server/convex';
import { canCustomizeVideoTitleFormat, isVideoType } from '$lib/title-format';
import {
	getConnectedYouTubeAccessToken,
	YouTubeConnectionError,
	youtubeAuthContext
} from '$lib/server/youtube-connection';
import {
	downloadYouTubeCaptionTrack,
	listYouTubeCaptionTracks,
	updateYouTubeVideoTitle,
	YouTubeDataApiError,
	type YouTubeCaptionTrack
} from '$lib/server/youtube-data-api';
import { validateVideoBaseline } from '$lib/video-validation';
import { api, internal } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Actions, PageServerLoad } from './$types';

function optionalString(data: FormData, key: string) {
	const value = data.get(key);
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalVideoType(data: FormData) {
	const value = optionalString(data, 'videoType');

	return isVideoType(value) ? value : undefined;
}

function captionTrackScore(track: YouTubeCaptionTrack) {
	const language = track.language?.toLowerCase() ?? '';
	const trackKind = track.trackKind?.toLowerCase() ?? '';

	return (
		(language === 'en' ? 100 : language.startsWith('en-') ? 90 : 0) +
		(trackKind === 'standard' ? 50 : 0) +
		(track.isAutoSynced ? 0 : 10) +
		(track.status === 'serving' ? 5 : 0)
	);
}

function bestCaptionTrack(tracks: YouTubeCaptionTrack[]) {
	return [...tracks].sort((a, b) => captionTrackScore(b) - captionTrackScore(a))[0];
}

export const load: PageServerLoad = async ({ params }) => {
	const videoView = await getConvexClient().query(api.videos.getViewByYoutubeVideoId, {
		youtubeVideoId: params.videoId
	});

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

	const captions = await convexAdminFunction(internal.videoCaptions.listByYoutubeVideoId, {
		youtubeVideoId: params.videoId
	});
	const availableSpeakers = await getConvexClient().query(api.videos.listSpeakers, {});
	const speakers = videoView.speakers.map((speakerRow) => ({
		name: speakerRow.speaker.name,
		company: speakerRow.speaker.company
	}));

	return {
		videoView,
		captions,
		availableSpeakers,
		assignmentValidationsById: Object.fromEntries(
			videoView.assignments.map((row) => [
				row.assignment._id,
				validateVideoBaseline(videoView.video.title, row.event, {
					speakers
				})
			])
		)
	};
};

export const actions: Actions = {
	fetchCaptions: async (event) => {
		const auth = youtubeAuthContext(event);

		try {
			const accessToken = await getConnectedYouTubeAccessToken(auth, { requireWrite: true });
			const tracks = await listYouTubeCaptionTracks(event.params.videoId, accessToken);
			const track = bestCaptionTrack(tracks);

			if (!track) {
				return {
					captionError: 'No caption tracks were found for this video.'
				};
			}

			const body = await downloadYouTubeCaptionTrack(track.id, accessToken, 'srt');

			await convexAdminFunction(internal.videoCaptions.upsertForYoutubeVideoId, {
				youtubeVideoId: event.params.videoId,
				caption: {
					captionTrackId: track.id,
					...(track.language !== undefined ? { language: track.language } : {}),
					...(track.name !== undefined ? { name: track.name } : {}),
					...(track.trackKind !== undefined ? { trackKind: track.trackKind } : {}),
					...(track.isAutoSynced !== undefined ? { isAutoSynced: track.isAutoSynced } : {}),
					...(track.status !== undefined ? { status: track.status } : {}),
					format: 'srt',
					body
				}
			});

			return {
				captionMessage: `Fetched ${track.language ?? 'unknown'} captions.`
			};
		} catch (caught) {
			if (caught instanceof YouTubeConnectionError || caught instanceof YouTubeDataApiError) {
				return { captionError: caught.message };
			}

			throw caught;
		}
	},

	updateMetadata: async ({ request, params }) => {
		const data = await request.formData();
		const videoType = optionalVideoType(data);

		await getConvexClient().mutation(api.videos.updateMetadata, {
			youtubeVideoId: params.videoId,
			videoType,
			...(canCustomizeVideoTitleFormat(videoType)
				? { videoTitleFormat: optionalString(data, 'videoTitleFormat') }
				: {})
		});
	},

	applyTitle: async (event) => {
		const data = await event.request.formData();
		const title = optionalString(data, 'title');

		if (!title) {
			return { titleUpdateError: 'Choose a title before updating YouTube.' };
		}

		try {
			const auth = youtubeAuthContext(event);
			const accessToken = await getConnectedYouTubeAccessToken(auth, { requireWrite: true });
			const updatedVideo = await updateYouTubeVideoTitle(event.params.videoId, title, accessToken);

			await getConvexClient().mutation(api.videos.updateTitle, {
				youtubeVideoId: event.params.videoId,
				title: updatedVideo.title
			});

			return { titleUpdateMessage: 'Updated title on YouTube.' };
		} catch (caught) {
			if (caught instanceof YouTubeConnectionError || caught instanceof YouTubeDataApiError) {
				return { titleUpdateError: caught.message };
			}

			throw caught;
		}
	},

	addSpeaker: async ({ request, params }) => {
		const data = await request.formData();
		const speakerId = optionalString(data, 'speakerId');
		const name = optionalString(data, 'name');

		if (speakerId) {
			await getConvexClient().mutation(api.videos.addSpeaker, {
				youtubeVideoId: params.videoId,
				speakerId: speakerId as Id<'speakers'>
			});

			return;
		}

		if (!name) {
			return;
		}

		await getConvexClient().mutation(api.videos.addSpeaker, {
			youtubeVideoId: params.videoId,
			name,
			company: optionalString(data, 'company'),
			position: optionalString(data, 'position')
		});
	},

	removeSpeaker: async ({ request, params }) => {
		const data = await request.formData();
		const speakerId = data.get('speakerId');

		if (typeof speakerId !== 'string') {
			return;
		}

		await getConvexClient().mutation(api.videos.removeSpeaker, {
			youtubeVideoId: params.videoId,
			speakerId: speakerId as Id<'speakers'>
		});
	}
};
