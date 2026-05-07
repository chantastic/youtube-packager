import { error, json } from '@sveltejs/kit';
import { generateDescriptionWithAnthropic } from '$lib/server/anthropic-description';
import { convexAdminFunction, getConvexClient } from '$lib/server/convex';
import { api, internal } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

function speakerNames(
	speakers: Array<{
		speaker: {
			name: string;
			company?: string;
			position?: string;
		};
	}>
) {
	return speakers
		.map((row) =>
			[row.speaker.name, row.speaker.position, row.speaker.company].filter(Boolean).join(', ')
		)
		.join('; ');
}

export const POST: RequestHandler = async ({ params }) => {
	const videoView = await getConvexClient().query(api.videoView.getByYoutubeVideoId, {
		youtubeVideoId: params.videoId
	});

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

	const captions = await convexAdminFunction(
		internal.videoCaptions.collectByYoutubeVideoIdInternal,
		{
			youtubeVideoId: params.videoId
		}
	);
	const caption = captions[0];

	if (!caption) {
		return json({
			description: null,
			error: 'Fetch captions before generating a structured description.'
		});
	}

	const result = await generateDescriptionWithAnthropic({
		video: {
			youtubeVideoId: videoView.video.youtubeVideoId,
			title: videoView.video.title,
			description: videoView.video.description,
			channelTitle: videoView.video.channelTitle,
			publishedAt: videoView.video.publishedAt,
			videoPublishedAt: videoView.video.videoPublishedAt,
			videoType: videoView.video.videoType
		},
		speakers: videoView.speakers.map((row) => ({
			name: row.speaker.name,
			company: row.speaker.company,
			position: row.speaker.position
		})),
		assignments: videoView.assignments.map((row) => ({
			assignmentId: row.assignment._id,
			event: row.event
		})),
		caption: {
			language: caption.language,
			name: caption.name,
			trackKind: caption.trackKind,
			body: caption.body
		},
		host: {
			label: 'WorkOS',
			url: 'https://workos.com'
		}
	});

	return json({
		...result,
		context: {
			captionId: caption._id,
			speakers: speakerNames(videoView.speakers)
		}
	});
};
