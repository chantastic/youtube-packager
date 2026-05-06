import { redirect } from '@sveltejs/kit';
import { internal } from '../../../convex/_generated/api';
import { convexAdminConfigError, convexAdminFunction } from '$lib/server/convex';
import {
	decryptRefreshToken,
	hasReadonlyScope,
	hasWriteScope,
	refreshYouTubeAccessToken
} from '$lib/server/youtube-oauth';

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

	return await convexAdminFunction(internal.youtubeConnections.getByAuth, auth);
}

export async function getConnectedYouTubeAccessToken(
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

		await convexAdminFunction(internal.youtubeConnections.markNeedsReauthorization, {
			...auth,
			lastError: message
		});

		throw new YouTubeConnectionError(message, 401);
	}
}
