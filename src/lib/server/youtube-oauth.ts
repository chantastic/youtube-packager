import { env } from '$env/dynamic/private';

const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
const googleTokenUrl = 'https://oauth2.googleapis.com/token';
const googleRevokeUrl = 'https://oauth2.googleapis.com/revoke';
const youtubeApiBaseUrl = 'https://www.googleapis.com/youtube/v3';

export const youtubeReadonlyScope = 'https://www.googleapis.com/auth/youtube.readonly';
export const youtubeWriteScope = 'https://www.googleapis.com/auth/youtube.force-ssl';
export const youtubeReadonlyScopes = [youtubeReadonlyScope];
export const youtubeWriteScopes = [youtubeWriteScope];

export type YouTubeOAuthMode = 'readonly' | 'write';

export type EncryptedToken = {
	ciphertext: string;
	iv: string;
};

export type GoogleTokenResponse = {
	accessToken: string;
	refreshToken?: string;
	expiresIn: number;
	tokenType?: string;
	scopes: string[];
};

export type AuthorizedYouTubeChannel = {
	id: string;
	title: string;
	customUrl?: string;
	thumbnailUrl?: string;
	uploadsPlaylistId?: string;
};

type GoogleTokenError = {
	error?: string;
	error_description?: string;
};

type YouTubeChannelListResponse = {
	error?: {
		message?: string;
	};
	items?: Array<{
		id?: string;
		snippet?: {
			title?: string;
			customUrl?: string;
			thumbnails?: {
				default?: { url?: string };
				medium?: { url?: string };
				high?: { url?: string };
			};
		};
		contentDetails?: {
			relatedPlaylists?: {
				uploads?: string;
			};
		};
	}>;
};

function requiredEnv(name: string, value: string | undefined) {
	if (!value) {
		throw new Error(`Set ${name} to use direct YouTube OAuth.`);
	}

	return value;
}

function clientId() {
	return requiredEnv('GOOGLE_OAUTH_CLIENT_ID', env.GOOGLE_OAUTH_CLIENT_ID);
}

function clientSecret() {
	return requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET', env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function encryptionSecret() {
	return requiredEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', env.GOOGLE_TOKEN_ENCRYPTION_KEY);
}

export function youtubeOAuthConfigError() {
	try {
		clientId();
		clientSecret();
		bytesFromSecret(encryptionSecret());

		return null;
	} catch (error) {
		return error instanceof Error ? error.message : 'YouTube OAuth is not configured.';
	}
}

function base64Encode(bytes: Uint8Array) {
	return Buffer.from(bytes).toString('base64');
}

function base64Decode(value: string) {
	return new Uint8Array(Buffer.from(value, 'base64'));
}

function bytesFromSecret(value: string) {
	const trimmed = value.trim();

	for (const encoding of ['base64', 'base64url'] as const) {
		try {
			const bytes = new Uint8Array(Buffer.from(trimmed, encoding));

			if (bytes.byteLength === 32) {
				return bytes;
			}
		} catch {
			// Try the next accepted format.
		}
	}

	const bytes = new TextEncoder().encode(trimmed);

	if (bytes.byteLength === 32) {
		return bytes;
	}

	throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
}

async function encryptionKey() {
	return await crypto.subtle.importKey(
		'raw',
		bytesFromSecret(encryptionSecret()),
		{ name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt']
	);
}

export function createOAuthState() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);

	return Buffer.from(bytes).toString('base64url');
}

export function scopesForMode(mode: YouTubeOAuthMode) {
	return mode === 'write' ? youtubeWriteScopes : youtubeReadonlyScopes;
}

export function hasWriteScope(scopes: string[]) {
	return scopes.includes(youtubeWriteScope);
}

export function hasReadonlyScope(scopes: string[]) {
	return scopes.includes(youtubeReadonlyScope) || hasWriteScope(scopes);
}

export function redirectUri(origin: string) {
	return env.GOOGLE_OAUTH_REDIRECT_URI ?? `${origin}/integrations/youtube/callback`;
}

export function buildYouTubeAuthorizationUrl({
	origin,
	state,
	mode
}: {
	origin: string;
	state: string;
	mode: YouTubeOAuthMode;
}) {
	const url = new URL(googleAuthUrl);

	url.searchParams.set('client_id', clientId());
	url.searchParams.set('redirect_uri', redirectUri(origin));
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', scopesForMode(mode).join(' '));
	url.searchParams.set('state', state);
	url.searchParams.set('access_type', 'offline');
	url.searchParams.set('include_granted_scopes', 'true');
	url.searchParams.set('prompt', 'consent select_account');

	return url.toString();
}

export function parseGoogleTokenResponse(body: Record<string, unknown>): GoogleTokenResponse {
	if (typeof body.access_token !== 'string') {
		const errorBody = body as GoogleTokenError;
		throw new Error(
			errorBody.error_description ?? errorBody.error ?? 'Google did not return an access token.'
		);
	}

	return {
		accessToken: body.access_token,
		refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
		expiresIn: typeof body.expires_in === 'number' ? body.expires_in : 0,
		tokenType: typeof body.token_type === 'string' ? body.token_type : undefined,
		scopes:
			typeof body.scope === 'string'
				? body.scope.split(/\s+/).filter((scope) => scope.length > 0)
				: []
	};
}

async function postGoogleToken(params: Record<string, string>) {
	const response = await fetch(googleTokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams(params)
	});
	const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

	if (!response.ok) {
		const errorBody = body as GoogleTokenError;
		throw new Error(
			errorBody.error_description ??
				errorBody.error ??
				`Google token request failed with ${response.status}.`
		);
	}

	return parseGoogleTokenResponse(body);
}

export async function exchangeYouTubeAuthorizationCode(code: string, origin: string) {
	return await postGoogleToken({
		code,
		client_id: clientId(),
		client_secret: clientSecret(),
		redirect_uri: redirectUri(origin),
		grant_type: 'authorization_code'
	});
}

export async function refreshYouTubeAccessToken(refreshToken: string) {
	return await postGoogleToken({
		refresh_token: refreshToken,
		client_id: clientId(),
		client_secret: clientSecret(),
		grant_type: 'refresh_token'
	});
}

export async function revokeGoogleToken(token: string) {
	const response = await fetch(googleRevokeUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({ token })
	});

	if (!response.ok) {
		throw new Error(`Google token revoke failed with ${response.status}.`);
	}
}

export async function listAuthorizedYouTubeChannels(
	accessToken: string
): Promise<AuthorizedYouTubeChannel[]> {
	const url = new URL(`${youtubeApiBaseUrl}/channels`);

	url.searchParams.set('part', 'snippet,contentDetails');
	url.searchParams.set('mine', 'true');

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});
	const body = (await response.json().catch(() => ({}))) as YouTubeChannelListResponse;

	if (!response.ok) {
		throw new Error(
			body.error?.message ?? `YouTube channel request failed with ${response.status}.`
		);
	}

	return (body.items ?? [])
		.filter((item) => typeof item.id === 'string')
		.map((item) => {
			const thumbnailUrl =
				item.snippet?.thumbnails?.medium?.url ??
				item.snippet?.thumbnails?.high?.url ??
				item.snippet?.thumbnails?.default?.url;

			return {
				id: item.id as string,
				title: item.snippet?.title ?? 'Untitled channel',
				...(item.snippet?.customUrl ? { customUrl: item.snippet.customUrl } : {}),
				...(thumbnailUrl ? { thumbnailUrl } : {}),
				...(item.contentDetails?.relatedPlaylists?.uploads
					? { uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads }
					: {})
			};
		});
}

export async function encryptRefreshToken(refreshToken: string): Promise<EncryptedToken> {
	const iv = new Uint8Array(12);
	crypto.getRandomValues(iv);

	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv
			},
			await encryptionKey(),
			new TextEncoder().encode(refreshToken)
		)
	);

	return {
		ciphertext: base64Encode(ciphertext),
		iv: base64Encode(iv)
	};
}

export async function decryptRefreshToken(token: EncryptedToken) {
	const plaintext = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: base64Decode(token.iv)
		},
		await encryptionKey(),
		base64Decode(token.ciphertext)
	);

	return new TextDecoder().decode(plaintext);
}
