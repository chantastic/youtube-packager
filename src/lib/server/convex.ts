import { ConvexHttpClient } from 'convex/browser';
import { env } from '$env/dynamic/public';

export function getConvexClient() {
	return new ConvexHttpClient(env.PUBLIC_CONVEX_URL);
}
