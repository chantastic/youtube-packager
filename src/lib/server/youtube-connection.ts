import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { internal } from '../../../convex/_generated/api';
import { convexAdminConfigError, convexAdminFunction } from '$lib/server/convex';
import {
	decryptRefreshToken,
	hasReadonlyScope,
	hasWriteScope,
	refreshYouTubeAccessToken,
	youtubeReadonlyScope,
	youtubeWriteScope
} from '$lib/server/youtube-oauth';
import {
	getWorkOSPipesAccessToken,
	workosPipesProvider,
	type WorkOSPipesAccessTokenResult
} from '$lib/server/workos-pipes';

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

export async function getYouTubeConnection(auth: { userId: string; organizationId?: string }) {
	const adminConfigError = convexAdminConfigError();

	if (adminConfigError) {
		throw new YouTubeConnectionError(adminConfigError, 500);
	}

	return await convexAdminFunction(
		internal.youtubeConnections.findByUserIdAndOrganizationKeyInternal,
		auth
	);
}

export async function getConnectedYouTubeAccessToken(
	auth: { userId: string; organizationId?: string },
	{ requireWrite = false }: { requireWrite?: boolean } = {}
) {
	const source = youtubeTokenSource();

	if (source !== 'direct') {
		try {
			return await getConnectedYouTubePipesAccessToken(auth, { requireWrite });
		} catch (caught) {
			if (source !== 'auto') {
				throw caught;
			}
		}
	}

	return await getConnectedDirectYouTubeAccessToken(auth, { requireWrite });
}

export function youtubeTokenSource() {
	const source = env.YOUTUBE_TOKEN_SOURCE;

	return source === 'direct' || source === 'auto' ? source : 'pipes';
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

async function getConnectedDirectYouTubeAccessToken(
	auth: { userId: string; organizationId?: string },
	{ requireWrite = false }: { requireWrite?: boolean } = {}
) {
	const connection = await getYouTubeConnection(auth);

	if (!connection) {
		throw new YouTubeConnectionError('Connect YouTube before using the YouTube API.', 401);
	}

	if (requireWrite ? !hasWriteScope(connection.scopes) : !hasReadonlyScope(connection.scopes)) {
		throw new YouTubeConnectionError(
			requireWrite
				? 'Reconnect YouTube with metadata write access before updating titles.'
				: 'Reconnect YouTube with read access before loading playlists.',
			403
		);
	}

	try {
		const refreshToken = await decryptRefreshToken({
			ciphertext: connection.refreshTokenCiphertext,
			iv: connection.refreshTokenIv
		});
		const token = await refreshYouTubeAccessToken(refreshToken);

		return token.accessToken;
	} catch (caught) {
		const message = caught instanceof Error ? caught.message : 'Could not refresh YouTube access.';

		await convexAdminFunction(
			internal.youtubeConnections.upsertNeedsReauthorizationByUserIdAndOrganizationKeyInternal,
			{
				...auth,
				lastError: message
			}
		);

		throw new YouTubeConnectionError(message, 401);
	}
}
