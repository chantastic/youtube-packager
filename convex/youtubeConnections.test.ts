/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const connection = {
	userId: 'user-1',
	organizationId: 'org-1',
	refreshTokenCiphertext: 'ciphertext-1',
	refreshTokenIv: 'iv-1',
	scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
	tokenType: 'Bearer'
};

test('upsertInternal stores and replaces a YouTube connection by user and organization', async () => {
	const t = convexTest(schema, modules);

	const created = await t.mutation(internal.youtubeConnections.upsertInternal, connection);
	const found = await t.query(internal.youtubeConnections.findByUserIdAndOrganizationKeyInternal, {
		userId: connection.userId,
		organizationId: connection.organizationId
	});

	expect(created).toMatchObject({
		userId: 'user-1',
		organizationId: 'org-1',
		organizationKey: 'org-1',
		status: 'active'
	});
	expect(found?._id).toBe(created?._id);

	const replaced = await t.mutation(internal.youtubeConnections.upsertInternal, {
		...connection,
		refreshTokenCiphertext: 'ciphertext-2',
		scopes: ['https://www.googleapis.com/auth/youtube.force-ssl']
	});
	const foundAfterReplace = await t.query(
		internal.youtubeConnections.findByUserIdAndOrganizationKeyInternal,
		{
			userId: connection.userId,
			organizationId: connection.organizationId
		}
	);

	expect(replaced?._id).toBe(created?._id);
	expect(foundAfterReplace).toMatchObject({
		refreshTokenCiphertext: 'ciphertext-2',
		scopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
		status: 'active'
	});
	expect(foundAfterReplace?.connectedAt).toBe(created?.connectedAt);
	expect(foundAfterReplace?.updatedAt).toBeGreaterThanOrEqual(created?.updatedAt ?? 0);
});

test('organizationless connections use an empty organization key', async () => {
	const t = convexTest(schema, modules);

	await t.mutation(internal.youtubeConnections.upsertInternal, {
		userId: 'user-1',
		refreshTokenCiphertext: 'ciphertext-1',
		refreshTokenIv: 'iv-1',
		scopes: ['https://www.googleapis.com/auth/youtube.readonly']
	});

	const found = await t.query(internal.youtubeConnections.findByUserIdAndOrganizationKeyInternal, {
		userId: 'user-1'
	});

	expect(found).toMatchObject({
		userId: 'user-1',
		organizationKey: '',
		status: 'active'
	});
});

test('reauthorization marking and destroy return the affected connection', async () => {
	const t = convexTest(schema, modules);

	const created = await t.mutation(internal.youtubeConnections.upsertInternal, connection);
	const marked = await t.mutation(
		internal.youtubeConnections.upsertNeedsReauthorizationByUserIdAndOrganizationKeyInternal,
		{
			userId: connection.userId,
			organizationId: connection.organizationId,
			lastError: 'Refresh token expired'
		}
	);

	expect(marked?._id).toBe(created?._id);
	expect(marked).toMatchObject({
		status: 'needs_reauthorization',
		lastError: 'Refresh token expired'
	});

	const destroyed = await t.mutation(
		internal.youtubeConnections.destroyByUserIdAndOrganizationKeyInternal,
		{
			userId: connection.userId,
			organizationId: connection.organizationId
		}
	);
	const found = await t.query(internal.youtubeConnections.findByUserIdAndOrganizationKeyInternal, {
		userId: connection.userId,
		organizationId: connection.organizationId
	});

	expect(destroyed?._id).toBe(created?._id);
	expect(found).toBeNull();
});

test('reauthorization and destroy are no-ops when no connection exists', async () => {
	const t = convexTest(schema, modules);

	await expect(
		t.mutation(
			internal.youtubeConnections.upsertNeedsReauthorizationByUserIdAndOrganizationKeyInternal,
			{
				userId: 'missing-user',
				lastError: 'No token'
			}
		)
	).resolves.toBeNull();
	await expect(
		t.mutation(internal.youtubeConnections.destroyByUserIdAndOrganizationKeyInternal, {
			userId: 'missing-user'
		})
	).resolves.toBeNull();
});
