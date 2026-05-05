import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	return {
		auth: event.locals.auth
	};
};
