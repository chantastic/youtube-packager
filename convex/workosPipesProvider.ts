'use node';

import { WorkOS } from '@workos-inc/node';
import {
	hasReadonlyScope,
	hasWriteScope,
	youtubeReadonlyScope,
	youtubeWriteScope
} from '../src/lib/server/youtube-scopes';

export type WorkOSPipesAuthContext = {
	userId: string;
	organizationId: string;
};

export class WorkOSPipesProviderError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'WorkOSPipesProviderError';
		this.status = status;
	}
}

function requiredEnv(name: string, value: string | undefined) {
	if (!value) {
		throw new WorkOSPipesProviderError(`Set ${name} to use WorkOS Pipes.`, 500);
	}

	return value;
}

function workosApiKey() {
	return requiredEnv('WORKOS_API_KEY', process.env.WORKOS_API_KEY);
}

export function workosPipesProvider() {
	return process.env.YOUTUBE_PIPES_PROVIDER?.trim() || 'google';
}

function getWorkOSClient() {
	return new WorkOS(workosApiKey());
}

export async function getConnectedYouTubeAccessToken(
	auth: WorkOSPipesAuthContext,
	{ requireWrite = false }: { requireWrite?: boolean } = {}
) {
	const response = await getWorkOSClient().pipes.getAccessToken({
		provider: workosPipesProvider(),
		userId: auth.userId,
		organizationId: auth.organizationId
	});

	if (!response.active) {
		throw new WorkOSPipesProviderError(
			response.error === 'needs_reauthorization'
				? 'Reauthorize YouTube in WorkOS Pipes before using the YouTube API.'
				: 'Connect YouTube in WorkOS Pipes before using the YouTube API.',
			401
		);
	}

	const scopes = response.accessToken.scopes;
	const missingScopes = response.accessToken.missingScopes;
	const requiredScope = requireWrite ? youtubeWriteScope : youtubeReadonlyScope;
	const hasRequiredScope = requireWrite ? hasWriteScope(scopes) : hasReadonlyScope(scopes);

	if (missingScopes.includes(requiredScope) || (scopes.length > 0 && !hasRequiredScope)) {
		throw new WorkOSPipesProviderError(
			requireWrite
				? `Reconnect ${workosPipesProvider()} in WorkOS Pipes with YouTube metadata write access.`
				: `Reconnect ${workosPipesProvider()} in WorkOS Pipes with YouTube read access.`,
			403
		);
	}

	return response.accessToken.accessToken;
}
