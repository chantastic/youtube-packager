import { fail, redirect } from '@sveltejs/kit';
import { pipesAccessTokenHasScope } from '$lib/server/youtube-connection';
import { youtubeReadonlyScope, youtubeWriteScope } from '$lib/server/youtube-scopes';
import {
	getWorkOSPipesAccessToken,
	getWorkOSPipesAuthorizationUrl,
	workosPipesConfigError,
	workosPipesProvider
} from '$lib/server/workos-pipes';
import { getConvexClientForEvent } from '$lib/server/convex';
import { api } from '../../../convex/_generated/api';
import type { Actions, PageServerLoad } from './$types';

function authContext(event: { locals: App.Locals }): { userId: string; organizationId?: string } {
	const auth = event.locals.auth;

	if (!auth?.user) {
		throw redirect(303, '/sign-in');
	}

	return auth.organizationId
		? { userId: auth.user.id, organizationId: auth.organizationId }
		: { userId: auth.user.id };
}

export const load: PageServerLoad = async (event) => {
	event.depends('app:workflow-jobs');

	const auth = authContext(event);
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

	return {
		pipesProvider: workosPipesProvider(),
		pipesConnection,
		pipesConfigError,
		pipesError,
		channelSyncJob: await getConvexClientForEvent(event).query(
			api.workflowJobViews.getLatestByKey,
			{
				key: 'integration:youtube',
				task: 'youtubeChannelSync'
			}
		),
		readonlyScope: youtubeReadonlyScope,
		writeScope: youtubeWriteScope,
		hasPipesReadonlyAccess: pipesConnection
			? pipesAccessTokenHasScope(pipesConnection, { requireWrite: false })
			: false,
		hasPipesWriteAccess: pipesConnection
			? pipesAccessTokenHasScope(pipesConnection, { requireWrite: true })
			: false
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

	testPipesRead: async (event) => {
		try {
			const client = getConvexClientForEvent(event);
			const result = await client.mutation(api.youtubeCommands.requestChannelSync, {});

			if (result.error) {
				throw new Error(result.error);
			}

			return {
				syncResult: {
					checkedAt: new Date().toISOString(),
					source: 'WorkOS Pipes'
				}
			};
		} catch (caught) {
			return fail(400, {
				error: caught instanceof Error ? caught.message : 'WorkOS Pipes YouTube test failed.'
			});
		}
	}
};
