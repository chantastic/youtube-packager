import { error, redirect } from '@sveltejs/kit';
import { api } from '../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { getConvexClient } from './convex';

export type VideoRouteTarget = NonNullable<
	FunctionReturnType<typeof api.videoViews.getByRouteParam>
>;
export type VideoView = VideoRouteTarget['videoView'];

export async function resolveVideoRouteTarget(
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

export async function resolveVideoView(
	client: ReturnType<typeof getConvexClient>,
	routeParam: string
) {
	return (await resolveVideoRouteTarget(client, routeParam)).videoView;
}

export async function resolveCanonicalVideoView(
	client: ReturnType<typeof getConvexClient>,
	routeParam: string
) {
	const routeTarget = await resolveVideoRouteTarget(client, routeParam);

	if (routeTarget.kind === 'youtubeVideoId') {
		throw redirect(308, `/videos/${routeTarget.videoView.video._id}`);
	}

	return routeTarget.videoView;
}
