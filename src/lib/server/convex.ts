import { ConvexHttpClient } from 'convex/browser';
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

type InternalConvexFunction = FunctionReference<'query' | 'mutation' | 'action', 'internal'>;

type ConvexAdminHttpClient = ConvexHttpClient & {
	setAdminAuth(token: string): void;
	function<Func extends InternalConvexFunction>(
		fn: Func,
		componentPath: string | undefined,
		...args: OptionalRestArgs<Func>
	): Promise<FunctionReturnType<Func>>;
};

export function getConvexClient() {
	return new ConvexHttpClient(publicEnv.PUBLIC_CONVEX_URL);
}

function convexAdminToken() {
	const token = privateEnv.CONVEX_ADMIN_TOKEN ?? privateEnv.CONVEX_ADMIN_KEY;

	if (!token) {
		throw new Error('Set CONVEX_ADMIN_TOKEN to call internal Convex functions.');
	}

	return token;
}

export function convexAdminConfigError() {
	try {
		convexAdminToken();

		return null;
	} catch (error) {
		return error instanceof Error ? error.message : 'Convex admin auth is not configured.';
	}
}

export function getConvexAdminClient(): ConvexAdminHttpClient {
	const client = getConvexClient() as ConvexAdminHttpClient;
	client.setAdminAuth(convexAdminToken());

	return client;
}

export async function convexAdminFunction<Func extends InternalConvexFunction>(
	fn: Func,
	...args: OptionalRestArgs<Func>
) {
	return await getConvexAdminClient().function(fn, undefined, ...args);
}
