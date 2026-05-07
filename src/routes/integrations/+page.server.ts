import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { internal } from '../../../convex/_generated/api';
import { convexAdminConfigError, convexAdminFunction } from '$lib/server/convex';
import {
	buildYouTubeAuthorizationUrl,
	createOAuthState,
	decryptRefreshToken,
	hasReadonlyScope,
	hasWriteScope,
	listAuthorizedYouTubeChannels,
	refreshYouTubeAccessToken,
	revokeGoogleToken,
	youtubeOAuthConfigError,
	youtubeReadonlyScope,
	youtubeWriteScope,
	type YouTubeOAuthMode
} from '$lib/server/youtube-oauth';
import {
	getConnectedYouTubePipesAccessToken,
	pipesAccessTokenHasScope,
	youtubeTokenSource
} from '$lib/server/youtube-connection';
import {
	getWorkOSPipesAccessToken,
	getWorkOSPipesAuthorizationUrl,
	workosPipesConfigError,
	workosPipesProvider
} from '$lib/server/workos-pipes';
import type { Actions, PageServerLoad } from './$types';

export const csr = false;

const stateCookie = 'youtube_oauth_state';
const modeCookie = 'youtube_oauth_mode';

type OAuthActionEvent = Pick<RequestEvent, 'cookies' | 'locals' | 'url'>;

function authContext(event: { locals: App.Locals }): { userId: string; organizationId?: string } {
	const auth = event.locals.auth;

	if (!auth?.user) {
		throw redirect(303, '/sign-in');
	}

	return auth.organizationId
		? { userId: auth.user.id, organizationId: auth.organizationId }
		: { userId: auth.user.id };
}

function setOAuthCookies(event: OAuthActionEvent, mode: YouTubeOAuthMode) {
	const state = createOAuthState();
	const cookieOptions = {
		path: '/integrations/youtube',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: event.url.protocol === 'https:',
		maxAge: 10 * 60
	};

	event.cookies.set(stateCookie, state, cookieOptions);
	event.cookies.set(modeCookie, mode, cookieOptions);

	return state;
}

function authorizationUrlFor(event: OAuthActionEvent, mode: YouTubeOAuthMode) {
	const state = setOAuthCookies(event, mode);

	return buildYouTubeAuthorizationUrl({
		origin: event.url.origin,
		state,
		mode
	});
}

export const load: PageServerLoad = async (event) => {
	const auth = authContext(event);
	const adminConfigError = convexAdminConfigError();
	const directConfigError = youtubeOAuthConfigError() ?? adminConfigError;
	const pipesConfigError = workosPipesConfigError();
	let pipesConnection: Awaited<ReturnType<typeof getWorkOSPipesAccessToken>> | null = null;
	let pipesError: string | null = null;

	if (!pipesConfigError) {
		try {
			pipesConnection = await getWorkOSPipesAccessToken(auth);
		} catch (error) {
			pipesError = error instanceof Error ? error.message : 'WorkOS Pipes connection check failed.';
		}
	}

	const directConnection = adminConfigError
		? null
		: await convexAdminFunction(
				internal.youtubeConnections.findByUserIdAndOrganizationKeyInternal,
				auth
			);
	const directScopes = directConnection?.scopes ?? [];

	return {
		pipesProvider: workosPipesProvider(),
		pipesConnection,
		pipesConfigError,
		pipesError,
		tokenSource: youtubeTokenSource(),
		directConnection,
		readonlyScope: youtubeReadonlyScope,
		writeScope: youtubeWriteScope,
		hasPipesReadonlyAccess: pipesConnection
			? pipesAccessTokenHasScope(pipesConnection, { requireWrite: false })
			: false,
		hasPipesWriteAccess: pipesConnection
			? pipesAccessTokenHasScope(pipesConnection, { requireWrite: true })
			: false,
		hasDirectReadonlyAccess: hasReadonlyScope(directScopes),
		hasDirectWriteAccess: hasWriteScope(directScopes),
		directConfigError
	};
};

export const actions: Actions = {
	connectPipes: async (event) => {
		let authorizationUrl: string;
		const auth = authContext(event);

		try {
			const configError = workosPipesConfigError();

			if (configError) {
				throw new Error(configError);
			}

			authorizationUrl = await getWorkOSPipesAuthorizationUrl(auth, {
				returnTo: `${event.url.origin}/integrations`
			});
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Could not start WorkOS Pipes.'
			});
		}

		throw redirect(303, authorizationUrl);
	},

	connectReadonly: async (event) => {
		let authorizationUrl: string;

		authContext(event);

		try {
			const configError = youtubeOAuthConfigError() ?? convexAdminConfigError();

			if (configError) {
				throw new Error(configError);
			}

			authorizationUrl = authorizationUrlFor(event, 'readonly');
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Could not start YouTube OAuth.'
			});
		}

		throw redirect(303, authorizationUrl);
	},

	connectWrite: async (event) => {
		let authorizationUrl: string;

		authContext(event);

		try {
			const configError = youtubeOAuthConfigError() ?? convexAdminConfigError();

			if (configError) {
				throw new Error(configError);
			}

			authorizationUrl = authorizationUrlFor(event, 'write');
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Could not start YouTube OAuth.'
			});
		}

		throw redirect(303, authorizationUrl);
	},

	testPipesRead: async (event) => {
		const auth = authContext(event);

		try {
			const accessToken = await getConnectedYouTubePipesAccessToken(auth);
			const channels = await listAuthorizedYouTubeChannels(accessToken);

			return {
				testResult: {
					checkedAt: new Date().toISOString(),
					channels,
					source: 'WorkOS Pipes'
				}
			};
		} catch (caught) {
			return fail(400, {
				error: caught instanceof Error ? caught.message : 'WorkOS Pipes YouTube test failed.'
			});
		}
	},

	testRead: async (event) => {
		const auth = authContext(event);
		const adminConfigError = convexAdminConfigError();

		if (adminConfigError) {
			return fail(400, { error: adminConfigError });
		}

		const connection = await convexAdminFunction(
			internal.youtubeConnections.findByUserIdAndOrganizationKeyInternal,
			auth
		);

		if (!connection) {
			return fail(400, { error: 'Connect YouTube before testing the API connection.' });
		}

		if (!hasReadonlyScope(connection.scopes)) {
			return fail(400, { error: 'Reconnect YouTube with read access before testing.' });
		}

		try {
			const refreshToken = await decryptRefreshToken({
				ciphertext: connection.refreshTokenCiphertext,
				iv: connection.refreshTokenIv
			});
			const token = await refreshYouTubeAccessToken(refreshToken);
			const channels = await listAuthorizedYouTubeChannels(token.accessToken);

			return {
				testResult: {
					checkedAt: new Date().toISOString(),
					channels,
					source: 'Direct Google OAuth'
				}
			};
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : 'YouTube API test failed.';

			await convexAdminFunction(
				internal.youtubeConnections.upsertNeedsReauthorizationByUserIdAndOrganizationKeyInternal,
				{
					...auth,
					lastError: message
				}
			);

			return fail(400, { error: message });
		}
	},

	disconnect: async (event) => {
		const auth = authContext(event);
		const adminConfigError = convexAdminConfigError();

		if (adminConfigError) {
			return fail(400, { error: adminConfigError });
		}

		const connection = await convexAdminFunction(
			internal.youtubeConnections.findByUserIdAndOrganizationKeyInternal,
			auth
		);

		if (connection) {
			try {
				const refreshToken = await decryptRefreshToken({
					ciphertext: connection.refreshTokenCiphertext,
					iv: connection.refreshTokenIv
				});

				await revokeGoogleToken(refreshToken);
			} catch {
				// Local disconnect should still succeed if Google revoke is temporarily unavailable.
			}
		}

		await convexAdminFunction(
			internal.youtubeConnections.destroyByUserIdAndOrganizationKeyInternal,
			auth
		);
	}
};
