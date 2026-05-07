/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

test('validateTitleAiChecks reports missing Anthropic API key without calling fetch', async () => {
	vi.stubEnv('ANTHROPIC_API_KEY', '');
	const fetchMock = vi.spyOn(globalThis, 'fetch');
	const t = convexTest(schema, modules);

	await expect(
		t.action(api.anthropicWorkflows.validateTitleAiChecks, {
			inputs: [
				{
					requestId: 'video-1:title:hook',
					videoId: 'video-1',
					field: 'title',
					checkId: 'hook',
					label: 'Hook',
					input: { title: 'Overview of Auth', hookText: 'Overview of Auth' }
				}
			]
		})
	).resolves.toEqual({
		validationsByRequestId: {},
		error: 'Set ANTHROPIC_API_KEY to run AI title checks.'
	});
	expect(fetchMock).not.toHaveBeenCalled();
});

test('validateTitleAiChecks maps Anthropic responses by request id', async () => {
	vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
	vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
		jsonResponse({
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						results: [
							{
								requestId: 'video-1:title:mechanics',
								status: 'pass',
								message: 'Looks clean'
							}
						]
					})
				}
			]
		})
	);
	const t = convexTest(schema, modules);

	await expect(
		t.action(api.anthropicWorkflows.validateTitleAiChecks, {
			inputs: [
				{
					requestId: 'video-1:title:mechanics',
					videoId: 'video-1',
					field: 'title',
					checkId: 'mechanics',
					label: 'Mechanics',
					input: { title: 'Build Better Auth' }
				}
			]
		})
	).resolves.toEqual({
		validationsByRequestId: {
			'video-1:title:mechanics': {
				id: 'mechanics',
				label: 'Mechanics',
				status: 'pass',
				message: 'Looks clean'
			}
		},
		error: null
	});
});
