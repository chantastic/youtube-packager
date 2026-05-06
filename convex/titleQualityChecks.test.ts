/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const cacheKey = {
	videoId: 'video-1',
	titleHash: 'hash-1',
	model: 'claude-haiku-4-5-20251001',
	validationVersion: 'title-quality-v1'
};

const check = {
	...cacheKey,
	title: 'A clean title',
	validations: [
		{
			id: 'title-quality',
			label: 'Title quality',
			status: 'pass' as const,
			message: 'Looks clean'
		}
	],
	checkedAt: 123
};

test('upsertMany stores and getMany retrieves title quality checks', async () => {
	const t = convexTest(schema, modules);

	await t.mutation(api.titleQualityChecks.upsertMany, {
		checks: [check]
	});

	const checks = await t.query(api.titleQualityChecks.getMany, {
		keys: [cacheKey]
	});

	expect(checks).toHaveLength(1);
	expect(checks[0]).toMatchObject(check);
});

test('upsertMany replaces existing title quality checks', async () => {
	const t = convexTest(schema, modules);

	await t.mutation(api.titleQualityChecks.upsertMany, {
		checks: [check]
	});
	await t.mutation(api.titleQualityChecks.upsertMany, {
		checks: [
			{
				...check,
				validations: [
					{
						id: 'title-quality',
						label: 'Title quality',
						status: 'fail' as const,
						message: 'Needs review'
					}
				],
				checkedAt: 456
			}
		]
	});

	const checks = await t.query(api.titleQualityChecks.getMany, {
		keys: [cacheKey]
	});

	expect(checks).toHaveLength(1);
	expect(checks[0].validations[0]).toMatchObject({
		status: 'fail',
		message: 'Needs review'
	});
	expect(checks[0].checkedAt).toBe(456);
});
