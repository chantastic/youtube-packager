import { error, json } from '@sveltejs/kit';
import { getConvexClient } from '$lib/server/convex';
import { api } from '../../../../../convex/_generated/api';
import type { RequestHandler } from './$types';

async function resolveVideoView(client: ReturnType<typeof getConvexClient>, routeParam: string) {
	const routeTarget = await client.query(api.videoViews.getByRouteParam, {
		routeParam
	});
	const videoView = routeTarget?.videoView ?? null;

	if (!videoView) {
		throw error(404, 'Video not found.');
	}

	return videoView;
}

export const GET: RequestHandler = async ({ params }) => {
	const client = getConvexClient();
	const videoView = await resolveVideoView(client, params.id);
	const job = await client.query(api.aiJobViews.getLatestDescriptionGenerationForVideo, {
		videoId: videoView.video._id
	});

	return json({ job });
};

export const POST: RequestHandler = async ({ params }) => {
	const client = getConvexClient();
	const videoView = await resolveVideoView(client, params.id);
	const result = await client.mutation(api.aiJobCommands.requestDescriptionGeneration, {
		videoId: videoView.video._id
	});

	return json(result);
};
