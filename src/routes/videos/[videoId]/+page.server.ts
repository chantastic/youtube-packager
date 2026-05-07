import { error, fail } from '@sveltejs/kit';
import { convexAdminFunction, getConvexClient } from '$lib/server/convex';
import {
	canCustomizeVideoTitleFormat,
	isVideoType,
	type VideoTitleFormatRecord
} from '$lib/title-format';
import {
	getConnectedYouTubeAccessToken,
	YouTubeConnectionError,
	youtubeAuthContext
} from '$lib/server/youtube-connection';
import {
	downloadYouTubeCaptionTrack,
	getYouTubeVideoData,
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

function videoTitleRecord(
	video: {
		titleOverride?: string;
		videoTitleFormat?: string;
		videoType?: VideoTitleFormatRecord['videoType'];
	},
	speakers: Array<{
		speaker: {
			name: string;
			company?: string;
			position?: string;
		};
	}>
): VideoTitleFormatRecord {
	const speaker = speakers.map((row) => row.speaker.name).join(', ');
	const company = [
		...new Set(
			speakers.map((row) => row.speaker.company).filter((value): value is string => Boolean(value))
		)
	].join(', ');
	const position = [
		...new Set(
			speakers.map((row) => row.speaker.position).filter((value): value is string => Boolean(value))
		)
	].join(', ');

	return {
		speaker: speaker || undefined,
		company: company || undefined,
		position: position || undefined,
		titleOverride: video.titleOverride,
		videoTitleFormat: video.videoTitleFormat,
		videoType: video.videoType
	};
}

export const load: PageServerLoad = async (event) => {
	const client = getConvexClient();
	let videoView = await client.query(api.videoViews.getByYoutubeVideoId, {
		youtubeVideoId: event.params.videoId
	});
	let refreshError: string | null = null;

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

	try {
		const auth = youtubeAuthContext(event);
		const accessToken = await getConnectedYouTubeAccessToken(auth);
		const refreshedVideo = await getYouTubeVideoData(event.params.videoId, accessToken);

		await client.mutation(api.videoCommands.recordYoutubeSnapshotByYoutubeVideoId, refreshedVideo);
		videoView =
			(await client.query(api.videoViews.getByYoutubeVideoId, {
				youtubeVideoId: event.params.videoId
			})) ?? videoView;
	} catch (caught) {
		if (caught instanceof YouTubeConnectionError || caught instanceof YouTubeDataApiError) {
			refreshError = caught.message;
		} else {
			throw caught;
		}
	}

	const captions = await convexAdminFunction(
		internal.videoCaptions.collectByYoutubeVideoIdInternal,
		{
			youtubeVideoId: event.params.videoId
		}
	);
	const availableSpeakers = await client.query(api.speakers.collect, {});
	const speakers = videoView.speakers.map((speakerRow) => ({
		name: speakerRow.speaker.name,
		company: speakerRow.speaker.company
	}));
	const selectedTitleFormat = videoTitleRecord(videoView.video, videoView.speakers);

	return {
		videoView,
		captions,
		availableSpeakers,
		refreshError,
		assignmentValidationsById: Object.fromEntries(
			videoView.assignments.map((row) => [
				row.assignment._id,
				validateVideoBaseline(videoView.video.title, row.event, {
					speakers,
					video: selectedTitleFormat
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

			await convexAdminFunction(
				internal.videoCaptions.upsertByYoutubeVideoIdAndCaptionTrackIdInternal,
				{
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
				}
			);

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

	updateMetadata: async (event) => {
		const data = await event.request.formData();
		const videoType = optionalVideoType(data);
		const titleOverride = optionalString(data, 'titleOverride');
		const titleOverrideEnabled = data.get('titleOverrideEnabled') === 'on';
		const client = getConvexClient();

		if (titleOverrideEnabled && !titleOverride) {
			return fail(400, {
				metadataError: 'Enter a title override before saving.'
			});
		}

		try {
			let updatedTitle = titleOverride;
			let wroteYouTubeTitle = false;
			const existingVideo = titleOverride
				? await client.query(api.videos.findByYoutubeVideoId, {
						youtubeVideoId: event.params.videoId
					})
				: null;

			if (titleOverride && existingVideo?.title !== titleOverride) {
				const auth = youtubeAuthContext(event);
				const accessToken = await getConnectedYouTubeAccessToken(auth, { requireWrite: true });
				const updatedVideo = await updateYouTubeVideoTitle(
					event.params.videoId,
					titleOverride,
					accessToken
				);

				updatedTitle = updatedVideo.title;
				wroteYouTubeTitle = true;
			}

			await client.mutation(api.videoCommands.setMetadataByYoutubeVideoId, {
				youtubeVideoId: event.params.videoId,
				videoType,
				...(updatedTitle ? { titleOverride: updatedTitle } : { clearTitleOverride: true }),
				...(canCustomizeVideoTitleFormat(videoType)
					? { videoTitleFormat: optionalString(data, 'videoTitleFormat') }
					: {})
			});

			if (updatedTitle && existingVideo?.title !== updatedTitle) {
				await client.mutation(api.videoCommands.recordTitleByYoutubeVideoId, {
					youtubeVideoId: event.params.videoId,
					title: updatedTitle
				});
			}

			return {
				metadataMessage: wroteYouTubeTitle
					? 'Saved metadata and updated YouTube title.'
					: updatedTitle
						? 'Saved metadata. YouTube title already matches.'
						: 'Saved metadata.'
			};
		} catch (caught) {
			if (caught instanceof YouTubeConnectionError || caught instanceof YouTubeDataApiError) {
				return fail(caught.status >= 400 && caught.status < 500 ? caught.status : 400, {
					metadataError: caught.message
				});
			}

			throw caught;
		}
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

			await getConvexClient().mutation(api.videoCommands.recordTitleByYoutubeVideoId, {
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
			await getConvexClient().mutation(api.videoCommands.assignSpeakerByYoutubeVideoId, {
				youtubeVideoId: params.videoId,
				speakerId: speakerId as Id<'speakers'>
			});

			return;
		}

		if (!name) {
			return;
		}

		await getConvexClient().mutation(api.videoCommands.assignSpeakerByYoutubeVideoId, {
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

		await getConvexClient().mutation(
			api.videoCommands.removeSpeakerByYoutubeVideoIdAndSpeakerId,
			{
				youtubeVideoId: params.videoId,
				speakerId: speakerId as Id<'speakers'>
			}
		);
	}
};
