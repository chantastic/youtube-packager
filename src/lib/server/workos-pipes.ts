import { WorkOS } from '@workos-inc/node';
import { env } from '$env/dynamic/private';

export type WorkOSPipesAuthContext = {
	userId: string;
	organizationId?: string;
};

export type WorkOSPipesAccessTokenResult =
	| {
			active: true;
			accessToken: {
				token: string;
				expiresAt: string | null;
				scopes: string[];
				missingScopes: string[];
			};
	  }
	| {
			active: false;
			error: 'not_installed' | 'needs_reauthorization';
	  };

type WorkOSAuthorizeResponse = {
	url?: unknown;
	message?: unknown;
	error?: unknown;
};

function requiredEnv(name: string, value: string | undefined) {
	if (!value) {
		throw new Error(`Set ${name} to use WorkOS Pipes.`);
	}

	return value;
}

function workosApiKey() {
	return requiredEnv('WORKOS_API_KEY', env.WORKOS_API_KEY);
}

function workosApiBaseUrl() {
	return env.WORKOS_API_BASE_URL?.trim() || 'https://api.workos.com';
}

export function workosPipesProvider() {
	return env.YOUTUBE_PIPES_PROVIDER?.trim() || 'google';
}

export function workosPipesConfigError() {
	try {
		workosApiKey();
		workosPipesProvider();

		return null;
	} catch (error) {
		return error instanceof Error ? error.message : 'WorkOS Pipes is not configured.';
	}
}

function getWorkOSClient() {
	return new WorkOS(workosApiKey());
}

function organizationIdOption(auth: WorkOSPipesAuthContext) {
	return auth.organizationId ?? null;
}

export async function getWorkOSPipesAccessToken(
	auth: WorkOSPipesAuthContext,
	{ provider = workosPipesProvider() }: { provider?: string } = {}
): Promise<WorkOSPipesAccessTokenResult> {
	const response = await getWorkOSClient().pipes.getAccessToken({
		provider,
		userId: auth.userId,
		organizationId: organizationIdOption(auth)
	});

	if (!response.active) {
		return response;
	}

	return {
		active: true,
		accessToken: {
			token: response.accessToken.accessToken,
			expiresAt: response.accessToken.expiresAt?.toISOString() ?? null,
			scopes: response.accessToken.scopes,
			missingScopes: response.accessToken.missingScopes
		}
	};
}

function workOSApiError(body: WorkOSAuthorizeResponse, status: number) {
	const message =
		(typeof body.message === 'string' && body.message) ||
		(typeof body.error === 'string' && body.error) ||
		`WorkOS Pipes request failed with ${status}.`;

	return new Error(message);
}

export async function getWorkOSPipesAuthorizationUrl(
	auth: WorkOSPipesAuthContext,
	{
		provider = workosPipesProvider(),
		returnTo
	}: {
		provider?: string;
		returnTo?: string;
	} = {}
) {
	const response = await fetch(`${workosApiBaseUrl()}/data-integrations/${provider}/authorize`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${workosApiKey()}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			user_id: auth.userId,
			organization_id: organizationIdOption(auth),
			...(returnTo ? { return_to: returnTo } : {})
		})
	});
	const body = (await response.json().catch(() => ({}))) as WorkOSAuthorizeResponse;

	if (!response.ok) {
		throw workOSApiError(body, response.status);
	}

	if (typeof body.url !== 'string') {
		throw new Error('WorkOS did not return a Pipes authorization URL.');
	}

	return body.url;
}
