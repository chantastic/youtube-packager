import { json } from '@sveltejs/kit';
import { getConvexClientForEvent } from '$lib/server/convex';
import { resolveVideoView } from '$lib/server/video-view';
import { api } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { params } = event;
	const client = getConvexClientForEvent(event);
	const videoView = await resolveVideoView(client, params.id);
	const job = await client.query(api.aiJobViews.getLatestDescriptionGenerationForVideo, {
		videoId: videoView.video._id
	});

	return json({ job });
};

export const POST: RequestHandler = async (event) => {
	const { params } = event;
	const client = getConvexClientForEvent(event);
	const videoView = await resolveVideoView(client, params.id);
	const result = await client.mutation(api.aiJobCommands.requestDescriptionGeneration, {
		videoId: videoView.video._id
	});

	return json(result);
};
