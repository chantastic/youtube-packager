import { fail } from '@sveltejs/kit';
import { getConvexClientForEvent } from '$lib/server/convex';
import { resolveCanonicalVideoView, resolveVideoView } from '$lib/server/video-view';
import { canCustomizeVideoTitleFormat, isVideoType } from '$lib/title-format';
import { isTitleCheckId, titleCheckIds } from '$lib/title-checks';
import { api } from '../../../../convex/_generated/api';
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

function disabledTitleValidationIdsFromForm(data: FormData) {
	const enabledTitleValidationIds = new Set(
		data
			.getAll('enabledTitleValidationIds')
			.filter((value): value is string => typeof value === 'string')
			.filter(isTitleCheckId)
	);

	return titleCheckIds.filter((checkId) => !enabledTitleValidationIds.has(checkId));
}

export const load: PageServerLoad = async (event) => {
	event.depends('app:workflow-jobs');

	const client = getConvexClientForEvent(event);
	const videoView = await resolveCanonicalVideoView(client, event.params.id);

	const [captions, descriptionJob, availableSpeakers, refreshJob, captionJob, titleUpdateJob] =
		await Promise.all([
			client.query(api.videoCaptions.collectByVideoId, {
				videoId: videoView.video._id
			}),
			client.query(api.aiJobViews.getLatestDescriptionGenerationForVideo, {
				videoId: videoView.video._id
			}),
			client.query(api.speakers.collect, {}),
			client.query(api.workflowJobViews.getLatestForVideoTask, {
				videoId: videoView.video._id,
				task: 'youtubeVideoRefresh'
			}),
			client.query(api.workflowJobViews.getLatestForVideoTask, {
				videoId: videoView.video._id,
				task: 'youtubeCaptionFetch'
			}),
			client.query(api.workflowJobViews.getLatestForVideoTask, {
				videoId: videoView.video._id,
				task: 'youtubeTitleUpdate'
			})
		]);

	return {
		videoView,
		captions,
		descriptionJob,
		availableSpeakers,
		refreshJob,
		captionJob,
		titleUpdateJob
	};
};

export const actions: Actions = {
	refreshVideo: async (event) => {
		const client = getConvexClientForEvent(event);
		const videoView = await resolveVideoView(client, event.params.id);
		const result = await client.mutation(api.youtubeCommands.requestVideoRefresh, {
			videoId: videoView.video._id
		});

		if (result.error) {
			return fail(400, {
				refreshError: result.error
			});
		}

		return {
			refreshMessage: 'Queued YouTube refresh.'
		};
	},

	fetchCaptions: async (event) => {
		const client = getConvexClientForEvent(event);
		const videoView = await resolveVideoView(client, event.params.id);
		const result = await client.mutation(api.youtubeCommands.requestCaptionFetch, {
			videoId: videoView.video._id
		});

		if (result.error) {
			return { captionError: result.error };
		}

		return {
			captionMessage: 'Queued caption fetch.'
		};
	},

	updateMetadata: async (event) => {
		const data = await event.request.formData();
		const videoType = optionalVideoType(data);
		const titleOverride = optionalString(data, 'titleOverride');
		const titleOverrideEnabled = data.get('titleOverrideEnabled') === 'on';
		const client = getConvexClientForEvent(event);
		const videoView = await resolveVideoView(client, event.params.id);

		if (titleOverrideEnabled && !titleOverride) {
			return fail(400, {
				metadataError: 'Enter a title override before saving.'
			});
		}

		await client.mutation(api.videoCommands.setMetadata, {
			videoId: videoView.video._id,
			videoType,
			...(titleOverrideEnabled && titleOverride ? { titleOverride } : { clearTitleOverride: true }),
			...(canCustomizeVideoTitleFormat(videoType)
				? { videoTitleFormat: optionalString(data, 'videoTitleFormat') }
				: {})
		});
		await client.mutation(api.videoCommands.setDisabledTitleValidations, {
			videoId: videoView.video._id,
			disabledTitleValidationIds: disabledTitleValidationIdsFromForm(data)
		});

		if (titleOverrideEnabled && titleOverride && videoView.video.title !== titleOverride) {
			const result = await client.mutation(api.youtubeCommands.requestTitleUpdate, {
				videoId: videoView.video._id,
				title: titleOverride
			});

			if (result.error) {
				return fail(400, {
					metadataError: result.error
				});
			}

			return {
				metadataMessage: 'Saved packaging and queued YouTube title update.'
			};
		}

		return {
			metadataMessage: titleOverrideEnabled
				? 'Saved packaging. YouTube title already matches.'
				: 'Saved packaging.'
		};
	},

	applyTitle: async (event) => {
		const data = await event.request.formData();
		const title = optionalString(data, 'title');

		if (!title) {
			return { titleUpdateError: 'Choose a title before updating YouTube.' };
		}

		const client = getConvexClientForEvent(event);
		const videoView = await resolveVideoView(client, event.params.id);
		const result = await client.mutation(api.youtubeCommands.requestTitleUpdate, {
			videoId: videoView.video._id,
			title
		});

		if (result.error) {
			return { titleUpdateError: result.error };
		}

		return { titleUpdateMessage: 'Queued YouTube title update.' };
	},

	addSpeaker: async (event) => {
		const { request, params } = event;
		const data = await request.formData();
		const speakerId = optionalString(data, 'speakerId');
		const name = optionalString(data, 'name');
		const client = getConvexClientForEvent(event);
		const videoView = await resolveVideoView(client, params.id);

		if (speakerId) {
			await client.mutation(api.videoCommands.assignSpeaker, {
				videoId: videoView.video._id,
				speakerId: speakerId as Id<'speakers'>
			});

			return;
		}

		if (!name) {
			return;
		}

		await client.mutation(api.videoCommands.assignSpeaker, {
			videoId: videoView.video._id,
			name,
			company: optionalString(data, 'company'),
			position: optionalString(data, 'position')
		});
	},

	removeSpeaker: async (event) => {
		const { request, params } = event;
		const data = await request.formData();
		const speakerId = data.get('speakerId');

		if (typeof speakerId !== 'string') {
			return;
		}

		const client = getConvexClientForEvent(event);
		const videoView = await resolveVideoView(client, params.id);
		await client.mutation(api.videoCommands.removeSpeaker, {
			videoId: videoView.video._id,
			speakerId: speakerId as Id<'speakers'>
		});
	}
};
