import { AuthKit, type AuthFunctions } from '@convex-dev/workos-authkit';
import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

function authKitEnv(name: string) {
	const value = process.env[name];

	if (value) {
		return value;
	}

	if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
		return `test-${name}`;
	}

	return undefined;
}

function webhookSecret() {
	const value = process.env.WORKOS_WEBHOOK_SECRET;

	if (value) {
		return value;
	}

	if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
		return 'test-WORKOS_WEBHOOK_SECRET';
	}

	// Keeps module analysis and non-webhook functions deployable before the WorkOS webhook exists.
	return `missing-WORKOS_WEBHOOK_SECRET-${Math.random().toString(36).slice(2)}`;
}

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
	authFunctions,
	clientId: authKitEnv('WORKOS_CLIENT_ID'),
	apiKey: authKitEnv('WORKOS_API_KEY'),
	webhookSecret: webhookSecret(),
	additionalEventTypes: ['organization.created', 'organization.updated', 'organization.deleted']
});

export const { backfillUsers } = authKit.utils();

export const { authKitEvent } = authKit.events({
	'user.created': async () => {},
	'user.updated': async () => {},
	'user.deleted': async () => {},
	'organization.created': async (ctx, event) => {
		await upsertOrganizationFromWorkOSEvent(ctx, event.data as unknown as Record<string, unknown>);
	},
	'organization.updated': async (ctx, event) => {
		await upsertOrganizationFromWorkOSEvent(ctx, event.data as unknown as Record<string, unknown>);
	},
	'organization.deleted': async (ctx, event) => {
		const organizationId = organizationIdFromEventData(
			event.data as unknown as Record<string, unknown>
		);

		if (!organizationId) {
			return;
		}

		const organization = await ctx.db
			.query('organizations')
			.withIndex('by_workosOrganizationId', (q) => q.eq('workosOrganizationId', organizationId))
			.unique();

		if (organization) {
			await ctx.db.delete(organization._id);
		}
	}
});

async function upsertOrganizationFromWorkOSEvent(ctx: MutationCtx, data: Record<string, unknown>) {
	const workosOrganizationId = organizationIdFromEventData(data);

	if (!workosOrganizationId) {
		return null;
	}

	const now = Date.now();
	const existing = await ctx.db
		.query('organizations')
		.withIndex('by_workosOrganizationId', (q) => q.eq('workosOrganizationId', workosOrganizationId))
		.unique();
	const organization = {
		workosOrganizationId,
		...(typeof data.name === 'string' ? { name: data.name } : {}),
		...(typeof data.slug === 'string' ? { slug: data.slug } : {}),
		updatedAt: now
	};

	if (existing) {
		await ctx.db.patch(existing._id, organization);

		return await ctx.db.get(existing._id);
	}

	const id = await ctx.db.insert('organizations', {
		...organization,
		createdAt: now
	});

	return await ctx.db.get(id);
}

function organizationIdFromEventData(data: Record<string, unknown>) {
	return typeof data.id === 'string' && data.id.startsWith('org_') ? data.id : null;
}
