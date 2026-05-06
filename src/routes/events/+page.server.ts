import { extractYouTubePlaylistId } from '$lib/youtube';
import { getConvexClient } from '$lib/server/convex';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { PageServerLoad, Actions } from './$types';

function optionalString(data: FormData, key: string) {
	const value = data.get(key);
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const load: PageServerLoad = async () => {
	const client = getConvexClient();
	const events = await client.query(api.events.list);
	return { events };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		await getConvexClient().mutation(api.events.create, {
			name: String(data.get('name')),
			year: Number(data.get('year')),
			titleFormat: optionalString(data, 'titleFormat'),
			youtubePlaylistId: extractYouTubePlaylistId(optionalString(data, 'youtubePlaylistId'))
		});
	},

	update: async ({ request }) => {
		const data = await request.formData();
		await getConvexClient().mutation(api.events.update, {
			id: String(data.get('id')) as Id<'events'>,
			name: String(data.get('name')),
			year: Number(data.get('year')),
			titleFormat: optionalString(data, 'titleFormat'),
			youtubePlaylistId: extractYouTubePlaylistId(optionalString(data, 'youtubePlaylistId'))
		});
	},

	remove: async ({ request }) => {
		const data = await request.formData();
		await getConvexClient().mutation(api.events.remove, {
			id: String(data.get('id')) as Id<'events'>
		});
	}
};
