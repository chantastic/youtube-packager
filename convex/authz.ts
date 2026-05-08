import type { UserIdentity } from 'convex/server';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';

type AuthCtx = Pick<QueryCtx | MutationCtx | ActionCtx, 'auth'>;

type OrganizationIdentity = UserIdentity & {
	user_id?: string;
	userId?: string;
	org_id?: string;
	orgId?: string;
	organization_id?: string;
	organizationId?: string;
};

export async function requireAuthenticatedUser(ctx: AuthCtx) {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new Error('Authentication required.');
	}

	return identity;
}

export async function requireOrganizationId(ctx: AuthCtx) {
	const identity = await requireAuthenticatedUser(ctx);
	const organizationId = organizationIdFromIdentity(identity);

	if (!organizationId) {
		throw new Error('Organization context required.');
	}

	return organizationId;
}

export async function requireWorkOSAuthContext(ctx: AuthCtx) {
	const identity = await requireAuthenticatedUser(ctx);
	const organizationId = organizationIdFromIdentity(identity);
	const userId = userIdFromIdentity(identity);

	if (!organizationId) {
		throw new Error('Organization context required.');
	}

	if (!userId) {
		throw new Error('WorkOS user context required.');
	}

	return { userId, organizationId };
}

export function userIdFromIdentity(identity: UserIdentity) {
	const workosIdentity = identity as OrganizationIdentity;

	for (const value of [workosIdentity.user_id, workosIdentity.userId, identity.subject]) {
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
	}

	const tokenIdentifier = identity.tokenIdentifier;
	const tokenSubject = tokenIdentifier.split('|').at(-1);

	return tokenSubject && tokenSubject.length > 0 ? tokenSubject : null;
}

export function organizationIdFromIdentity(identity: UserIdentity) {
	const workosIdentity = identity as OrganizationIdentity;

	for (const value of [
		workosIdentity.org_id,
		workosIdentity.organization_id,
		workosIdentity.organizationId,
		workosIdentity.orgId
	]) {
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
	}

	return null;
}

export function documentBelongsToOrganization(document: null, organizationId: string): false;
export function documentBelongsToOrganization<T extends { organizationId: string }>(
	document: T | null,
	organizationId: string
): document is T;
export function documentBelongsToOrganization<T extends { organizationId: string }>(
	document: T | null,
	organizationId: string
) {
	return Boolean(document && document.organizationId === organizationId);
}

export function requireDocumentInOrganization<T extends { organizationId: string }>(
	document: T | null,
	organizationId: string,
	message: string
) {
	if (!documentBelongsToOrganization(document, organizationId)) {
		throw new Error(message);
	}

	return document;
}
