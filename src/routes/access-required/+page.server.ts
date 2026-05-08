import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.auth.user) {
		throw redirect(
			303,
			`/sign-in?returnTo=${encodeURIComponent(url.searchParams.get('returnTo') ?? '/events')}`
		);
	}

	if (locals.auth.organizationId) {
		throw redirect(303, url.searchParams.get('returnTo') ?? '/events');
	}

	return {
		user: locals.auth.user
	};
};
