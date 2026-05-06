import { error, json } from '@sveltejs/kit';
import { generateTitleAlternativesWithAnthropic } from '$lib/server/anthropic-title-alternatives';
import { getConvexClient } from '$lib/server/convex';
import { api } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const videoView = await getConvexClient().query(api.videos.getViewByYoutubeVideoId, {
		youtubeVideoId: params.videoId
	});

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

	const speakerNames = videoView.speakers.map((row) => row.speaker.name).join(', ');
	const speakers = videoView.speakers.map((row) => ({
		name: row.speaker.name,
		company: row.speaker.company,
		position: row.speaker.position
	}));
	const companies = [
		...new Set(
			videoView.speakers
				.map((row) => row.speaker.company)
				.filter((company): company is string => Boolean(company))
		)
	].join(', ');
	const positions = [
		...new Set(
			videoView.speakers
				.map((row) => row.speaker.position)
				.filter((position): position is string => Boolean(position))
		)
	].join(', ');
	const result = await generateTitleAlternativesWithAnthropic({
		currentTitle: videoView.video.title,
		description: videoView.video.description,
		video: {
			speaker: speakerNames || undefined,
			company: companies || undefined,
			position: positions || undefined,
			titleOverride: videoView.video.titleOverride,
			videoTitleFormat: videoView.video.videoTitleFormat,
			videoType: videoView.video.videoType
		},
		videoContext: {
			youtubeVideoId: videoView.video.youtubeVideoId,
			title: videoView.video.title,
			description: videoView.video.description,
			channelTitle: videoView.video.channelTitle,
			publishedAt: videoView.video.publishedAt,
			videoPublishedAt: videoView.video.videoPublishedAt,
			speakers
		},
		assignments: videoView.assignments.map((row) => ({
			assignmentId: row.assignment._id,
			event: row.event
		}))
	});

	return json(result);
};
