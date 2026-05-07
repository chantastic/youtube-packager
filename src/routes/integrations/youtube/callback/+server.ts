import { error, redirect } from '@sveltejs/kit';
import { internal } from '../../../../../convex/_generated/api';
import { convexAdminFunction } from '$lib/server/convex';
import {
	decryptRefreshToken,
	encryptRefreshToken,
	exchangeYouTubeAuthorizationCode,
	type YouTubeOAuthMode
} from '$lib/server/youtube-oauth';
import type { RequestHandler } from './$types';

const stateCookie = 'youtube_oauth_state';
const modeCookie = 'youtube_oauth_mode';

function authContext(event: Parameters<RequestHandler>[0]): {
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

function clearOAuthCookies(event: Parameters<RequestHandler>[0]) {
	const options = {
		path: '/integrations/youtube'
	};

	event.cookies.delete(stateCookie, options);
	event.cookies.delete(modeCookie, options);
}

export const GET: RequestHandler = async (event) => {
	const auth = authContext(event);
	const expectedState = event.cookies.get(stateCookie);
	const state = event.url.searchParams.get('state');
	const code = event.url.searchParams.get('code');
	const oauthError = event.url.searchParams.get('error');

	if (oauthError) {
		clearOAuthCookies(event);
		throw redirect(303, `/integrations?error=${encodeURIComponent(oauthError)}`);
	}

	if (!expectedState || !state || expectedState !== state) {
		clearOAuthCookies(event);
		throw error(400, 'Invalid YouTube OAuth state.');
	}

	if (!code) {
		clearOAuthCookies(event);
		throw error(400, 'Missing YouTube OAuth code.');
	}

	const mode = event.cookies.get(modeCookie) as YouTubeOAuthMode | undefined;
	const existingConnection = await convexAdminFunction(
		internal.youtubeConnections.findByUserIdAndOrganizationKeyInternal,
		auth
	);

	try {
		const token = await exchangeYouTubeAuthorizationCode(code, event.url.origin);
		const refreshToken =
			token.refreshToken ??
			(existingConnection
				? await decryptRefreshToken({
						ciphertext: existingConnection.refreshTokenCiphertext,
						iv: existingConnection.refreshTokenIv
					})
				: undefined);

		if (!refreshToken) {
			throw new Error(
				'Google did not return a refresh token. Reconnect and approve offline access.'
			);
		}

		const encrypted = await encryptRefreshToken(refreshToken);

		await convexAdminFunction(internal.youtubeConnections.upsertInternal, {
			...auth,
			refreshTokenCiphertext: encrypted.ciphertext,
			refreshTokenIv: encrypted.iv,
			scopes: token.scopes,
			...(token.tokenType !== undefined ? { tokenType: token.tokenType } : {})
		});
	} catch (caught) {
		clearOAuthCookies(event);
		await convexAdminFunction(
			internal.youtubeConnections.upsertNeedsReauthorizationByUserIdAndOrganizationKeyInternal,
			{
				...auth,
				lastError: caught instanceof Error ? caught.message : 'YouTube OAuth failed.'
			}
		);
		throw redirect(303, '/integrations?error=youtube_oauth_failed');
	}

	clearOAuthCookies(event);
	throw redirect(303, `/integrations?connected=${mode ?? 'youtube'}`);
};
