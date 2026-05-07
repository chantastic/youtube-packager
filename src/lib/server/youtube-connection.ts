import { redirect } from '@sveltejs/kit';
import {
	getWorkOSPipesAccessToken,
	workosPipesProvider,
	type WorkOSPipesAccessTokenResult
} from '$lib/server/workos-pipes';
import {
	hasReadonlyScope,
	hasWriteScope,
	youtubeReadonlyScope,
	youtubeWriteScope
} from '$lib/server/youtube-scopes';

export class YouTubeConnectionError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'YouTubeConnectionError';
		this.status = status;
	}
}

export function youtubeAuthContext(event: { locals: App.Locals }): {
	userId: string;
	organizationId?: string;
} {
	const auth = event.locals.auth;

	if (!auth?.user) {
		throw redirect(303, '/sign-in');
	}

	return auth.organizationId
		? { userId: auth.user.id, organizationId: auth.organizationId }
		: { userId: auth.user.id };
}

export async function getConnectedYouTubeAccessToken(
	auth: { userId: string; organizationId?: string },
	{ requireWrite = false }: { requireWrite?: boolean } = {}
) {
	return await getConnectedYouTubePipesAccessToken(auth, { requireWrite });
}

export function pipesAccessTokenHasScope(
	result: WorkOSPipesAccessTokenResult,
	{ requireWrite = false }: { requireWrite?: boolean } = {}
) {
	if (!result.active) {
		return false;
	}

	const requiredScope = requireWrite ? youtubeWriteScope : youtubeReadonlyScope;

	if (result.accessToken.missingScopes.includes(requiredScope)) {
		return false;
	}

	if (!result.accessToken.scopes.length) {
		return true;
	}

	return requireWrite
		? hasWriteScope(result.accessToken.scopes)
		: hasReadonlyScope(result.accessToken.scopes);
}

export async function getConnectedYouTubePipesAccessToken(
	auth: { userId: string; organizationId?: string },
	{ requireWrite = false }: { requireWrite?: boolean } = {}
) {
	const result = await getWorkOSPipesAccessToken(auth);

	if (!result.active) {
		throw new YouTubeConnectionError(
			result.error === 'needs_reauthorization'
				? 'Reauthorize YouTube in WorkOS Pipes before using the YouTube API.'
				: 'Connect YouTube in WorkOS Pipes before using the YouTube API.',
			401
		);
	}

	if (!pipesAccessTokenHasScope(result, { requireWrite })) {
		throw new YouTubeConnectionError(
			requireWrite
				? `Reconnect ${workosPipesProvider()} in WorkOS Pipes with YouTube metadata write access.`
				: `Reconnect ${workosPipesProvider()} in WorkOS Pipes with YouTube read access.`,
			403
		);
	}

	return result.accessToken.token;
}
