import { query } from './_generated/server';

export const collect = query({
	args: {},
	handler: async (ctx) => {
		const speakers = await ctx.db.query('speakers').take(500);

		return speakers.sort((a, b) =>
			[a.name, a.company ?? '', a.position ?? '']
				.join(' ')
				.localeCompare([b.name, b.company ?? '', b.position ?? ''].join(' '))
		);
	}
});
