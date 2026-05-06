import { error } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import { validateVideoBaseline } from '$lib/video-validation';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Actions, PageServerLoad } from './$types';

function optionalString(data: FormData, key: string) {
	const value = data.get(key);
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export const load: PageServerLoad = async ({ params }) => {
	const videoView = await getConvexClient().query(api.videos.getViewByYoutubeVideoId, {
		youtubeVideoId: params.videoId
	});

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

	return {
		videoView,
		assignmentValidationsById: Object.fromEntries(
			videoView.assignments.map((row) => [
				row.assignment._id,
				validateVideoBaseline(videoView.video.title, row.event)
			])
		)
	};
};

export const actions: Actions = {
	updateMetadata: async ({ request, params }) => {
		const data = await request.formData();

		await getConvexClient().mutation(api.videos.updateMetadata, {
			youtubeVideoId: params.videoId,
			videoTitleFormat: optionalString(data, 'videoTitleFormat')
		});
	},

	addSpeaker: async ({ request, params }) => {
		const data = await request.formData();
		const name = optionalString(data, 'name');

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
