import { query } from './_generated/server';
import { requireOrganizationId } from './authz';

export const collect = query({
	args: {},
	handler: async (ctx) => {
		const organizationId = await requireOrganizationId(ctx);
		const scopedSpeakers = await ctx.db
			.query('speakers')
			.withIndex('by_organizationId_and_name_and_company', (q) =>
				q.eq('organizationId', organizationId)
			)
			.take(500);
		const legacySpeakers = await ctx.db
			.query('speakers')
			.withIndex('by_organizationId_and_name_and_company', (q) => q.eq('organizationId', undefined))
			.take(500);
		const speakers = [...legacySpeakers, ...scopedSpeakers];

		return speakers.sort((a, b) =>
			[a.name, a.company ?? '', a.position ?? '']
				.join(' ')
				.localeCompare([b.name, b.company ?? '', b.position ?? ''].join(' '))
		);
	}
});
