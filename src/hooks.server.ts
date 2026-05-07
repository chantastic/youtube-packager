import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { configureAuthKit, authKitHandle } from '@workos/authkit-sveltekit';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';

configureAuthKit({
	clientId: env.WORKOS_CLIENT_ID,
	apiKey: env.WORKOS_API_KEY,
	redirectUri: env.WORKOS_REDIRECT_URI,
	cookiePassword: env.WORKOS_COOKIE_PASSWORD
});

const protectedPrefixes = ['/events', '/videos', '/integrations'];

const guardOrganizationRoutes: Handle = async ({ event, resolve }) => {
	if (protectedPrefixes.some((prefix) => event.url.pathname.startsWith(prefix))) {
		const returnTo = `${event.url.pathname}${event.url.search}`;

		if (!event.locals.auth.user) {
			throw redirect(303, `/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
		}

		if (!event.locals.auth.organizationId) {
			throw redirect(303, `/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
		}
	}

	return await resolve(event);
};

export const handle = sequence(authKitHandle(), guardOrganizationRoutes);
