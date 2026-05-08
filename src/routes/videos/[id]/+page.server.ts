import { error, fail, redirect } from '@sveltejs/kit';
import { getConvexClient, getConvexClientForEvent } from '$lib/server/convex';
import {
	canCustomizeVideoTitleFormat,
	isVideoType,
	type VideoTitleFormatRecord
} from '$lib/title-format';
import { isTitleCheckId, titleCheckIds } from '$lib/title-checks';
import { validateVideoBaseline } from '$lib/video-validation';
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

async function resolveVideoRouteTarget(
	client: ReturnType<typeof getConvexClient>,
	routeParam: string
) {
	const routeTarget = await client.query(api.videoViews.getByRouteParam, {
		routeParam
	});

	if (!routeTarget) {
		throw error(404, 'Video not found.');
	}

	return routeTarget;
}

export const load: PageServerLoad = async (event) => {
	event.depends('app:workflow-jobs');

	const client = getConvexClientForEvent(event);
	const routeTarget = await resolveVideoRouteTarget(client, event.params.id);
	const videoView = routeTarget.videoView;

	if (routeTarget.kind === 'youtubeVideoId') {
		throw redirect(308, `/videos/${videoView.video._id}`);
	}

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
	const speakers = videoView.speakers.map((speakerRow) => ({
		name: speakerRow.speaker.name,
		company: speakerRow.speaker.company
	}));
	const selectedTitleFormat = videoTitleRecord(videoView.video, videoView.speakers);

	return {
		videoView,
		captions,
		descriptionJob,
		availableSpeakers,
		refreshJob,
		captionJob,
		titleUpdateJob,
		assignmentValidationsById: Object.fromEntries(
			videoView.assignments.map((row) => [
				row.assignment._id,
				validateVideoBaseline(videoView.video.title, row.event, {
					speakers,
					video: selectedTitleFormat,
					disabledTitleValidationIds: videoView.video.disabledTitleValidationIds
				})
			])
		)
	};
};

export const actions: Actions = {
	refreshVideo: async (event) => {
		const client = getConvexClientForEvent(event);
		const videoView = (await resolveVideoRouteTarget(client, event.params.id)).videoView;
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
		const videoView = (await resolveVideoRouteTarget(client, event.params.id)).videoView;
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
		const videoView = (await resolveVideoRouteTarget(client, event.params.id)).videoView;

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
				metadataMessage: 'Saved metadata and queued YouTube title update.'
			};
		}

		return {
			metadataMessage: titleOverrideEnabled
				? 'Saved metadata. YouTube title already matches.'
				: 'Saved metadata.'
		};
	},

	applyTitle: async (event) => {
		const data = await event.request.formData();
		const title = optionalString(data, 'title');

		if (!title) {
			return { titleUpdateError: 'Choose a title before updating YouTube.' };
		}

		const client = getConvexClientForEvent(event);
		const videoView = (await resolveVideoRouteTarget(client, event.params.id)).videoView;
		const result = await client.mutation(api.youtubeCommands.requestTitleUpdate, {
			videoId: videoView.video._id,
			title
		});

		if (result.error) {
			return { titleUpdateError: result.error };
		}

		return { titleUpdateMessage: 'Queued YouTube title update.' };
	},

	setValidationPreferences: async (event) => {
		const data = await event.request.formData();
		const enabledTitleValidationIds = new Set(
			data
				.getAll('enabledTitleValidationIds')
				.filter((value): value is string => typeof value === 'string')
				.filter(isTitleCheckId)
		);
		const disabledTitleValidationIds = titleCheckIds.filter(
			(checkId) => !enabledTitleValidationIds.has(checkId)
		);
		const client = getConvexClientForEvent(event);
		const videoView = (await resolveVideoRouteTarget(client, event.params.id)).videoView;

		await client.mutation(api.videoCommands.setDisabledTitleValidations, {
			videoId: videoView.video._id,
			disabledTitleValidationIds
		});

		return {
			validationPreferencesMessage: 'Saved validation checks.'
		};
	},

	addSpeaker: async (event) => {
		const { request, params } = event;
		const data = await request.formData();
		const speakerId = optionalString(data, 'speakerId');
		const name = optionalString(data, 'name');
		const client = getConvexClientForEvent(event);
		const videoView = (await resolveVideoRouteTarget(client, params.id)).videoView;

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
		const videoView = (await resolveVideoRouteTarget(client, params.id)).videoView;
		await client.mutation(api.videoCommands.removeSpeaker, {
			videoId: videoView.video._id,
			speakerId: speakerId as Id<'speakers'>
		});
	}
};
