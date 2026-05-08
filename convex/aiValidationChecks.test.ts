/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const cacheKey = {
	organizationId: 'org_test',
	videoId: 'video-1',
	field: 'title',
	checkId: 'hook',
	inputHash: 'hash-1',
	model: 'claude-haiku-4-5-20251001',
	promptVersion: 'title-hook-v1',
	modelConfigHash: 'model-config-1'
};

const check = {
	...cacheKey,
	inputSnapshot: '{"title":"A clean title"}',
	validation: {
		id: 'hook',
		label: 'Hook',
		status: 'pass' as const,
		message: 'Hook is specific'
	},
	checkedAt: 123
};

test('upsertMany stores and getMany retrieves AI validation checks', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});

	await t.mutation(internal.aiValidationChecks.upsertManyInternal, {
		checks: [check]
	});

	const checks = await t.query(internal.aiValidationChecks.collectByCacheKeyInternal, {
		keys: [cacheKey]
	});

	expect(checks).toHaveLength(1);
	expect(checks[0]).toMatchObject(check);
});

test('upsertMany replaces existing AI validation checks', async () => {
	const t = convexTest(schema, modules).withIdentity({
		subject: 'user_test',
		tokenIdentifier: 'user_test',
		issuer: 'https://api.workos.com',
		org_id: 'org_test'
	});

	await t.mutation(internal.aiValidationChecks.upsertManyInternal, {
		checks: [check]
	});
	await t.mutation(internal.aiValidationChecks.upsertManyInternal, {
		checks: [
			{
				...check,
				validation: {
					id: 'hook',
					label: 'Hook',
					status: 'fail' as const,
					message: 'Too vague'
				},
				checkedAt: 456
			}
		]
	});

	const checks = await t.query(internal.aiValidationChecks.collectByCacheKeyInternal, {
		keys: [cacheKey]
	});

	expect(checks).toHaveLength(1);
	expect(checks[0].validation).toMatchObject({
		status: 'fail',
		message: 'Too vague'
	});
	expect(checks[0].checkedAt).toBe(456);
});
