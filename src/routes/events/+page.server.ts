import { ConvexHttpClient } from 'convex/browser';
import { env } from '$env/dynamic/public';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { PageServerLoad, Actions } from './$types';

function getClient() {
	return new ConvexHttpClient(env.PUBLIC_CONVEX_URL);
}

function optionalString(data: FormData, key: string) {
	const value = data.get(key);
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const load: PageServerLoad = async () => {
	const client = getClient();
	const events = await client.query(api.events.list);
	return { events };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		await getClient().mutation(api.events.create, {
			name: String(data.get('name')),
			year: Number(data.get('year')),
			titleFormat: optionalString(data, 'titleFormat')
		});
	},

	update: async ({ request }) => {
		const data = await request.formData();
		await getClient().mutation(api.events.update, {
			id: String(data.get('id')) as Id<'events'>,
			name: String(data.get('name')),
			year: Number(data.get('year')),
			titleFormat: optionalString(data, 'titleFormat')
		});
	},

	remove: async ({ request }) => {
		const data = await request.formData();
		await getClient().mutation(api.events.remove, {
			id: String(data.get('id')) as Id<'events'>
		});
	}
};
