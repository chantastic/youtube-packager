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
		t.action(api.videoWorkflows.validateTitleAiChecks, {
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
		t.action(api.videoWorkflows.validateTitleAiChecks, {
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

test('buildTitleAiChecks writes and reuses cached AI title checks', async () => {
	vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
		const body = JSON.parse(String(init?.body ?? '{}'));
		const requests = JSON.parse(String(body.messages[0].content).split('Requests:\n')[1]);

		return jsonResponse({
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						results: [
							{
								requestId: requests[0].requestId,
								status: 'fail',
								message: 'Too vague'
							}
						]
					})
				}
			]
		});
	});
	const t = convexTest(schema, modules);
	const input = {
		videoId: 'video-1',
		field: 'title',
		checkId: 'hook' as const,
		label: 'Hook',
		input: { title: 'Overview of Auth', hookText: 'Overview of Auth' }
	};
	const first = await t.action(api.videoWorkflows.buildTitleAiChecks, {
		inputs: [input]
	});
	const second = await t.action(api.videoWorkflows.buildTitleAiChecks, {
		inputs: [input]
	});
	const validation = {
		id: 'hook',
		label: 'Hook',
		status: 'fail',
		message: 'Too vague'
	};

	expect(fetchMock).toHaveBeenCalledTimes(1);
	expect(first.validationsByVideoId).toEqual({
		'video-1': [validation]
	});
	expect(first.cache).toMatchObject({ hits: 0, misses: 1, writes: 1, total: 1 });
	expect(second.validationsByVideoId).toEqual({
		'video-1': [validation]
	});
	expect(second.cache).toMatchObject({ hits: 1, misses: 0, writes: 0, total: 1 });
});

test('generateTitleAlternatives formats Anthropic base titles by playlist rules', async () => {
	vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
	vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
		jsonResponse({
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						results: [
							{
								assignmentId: 'assignment-1',
								baseTitles: ['Build Agent-Native Auth That Works']
							}
						]
					})
				}
			]
		})
	);
	const t = convexTest(schema, modules);

	await expect(
		t.action(api.videoWorkflows.generateTitleAlternatives, {
			input: {
				currentTitle: 'Overview of Agent-Native Auth — Chan, WorkOS | TestConf 2026',
				video: {
					speaker: 'Chan',
					company: 'WorkOS',
					videoTitleFormat: '{title} — {speaker}, {company}'
				},
				assignments: [
					{
						assignmentId: 'assignment-1',
						event: {
							name: 'TestConf',
							year: 2026,
							titleFormat: '{title} | {event_name} {year}'
						}
					}
				]
			}
		})
	).resolves.toEqual({
		alternativesByAssignmentId: {
			'assignment-1': {
				assignmentId: 'assignment-1',
				alternatives: ['Build Agent-Native Auth That Works — Chan, WorkOS | TestConf 2026'],
				error: null
			}
		},
		error: null
	});
});

test('generateTitleAlternatives reports missing Anthropic API key without calling fetch', async () => {
	vi.stubEnv('ANTHROPIC_API_KEY', '');
	const fetchMock = vi.spyOn(globalThis, 'fetch');
	const t = convexTest(schema, modules);

	await expect(
		t.action(api.videoWorkflows.generateTitleAlternatives, {
			input: {
				currentTitle: 'Overview of Agent-Native Auth — Chan, WorkOS | TestConf 2026',
				video: {
					speaker: 'Chan',
					company: 'WorkOS'
				},
				assignments: [
					{
						assignmentId: 'assignment-1',
						event: {
							name: 'TestConf',
							year: 2026,
							titleFormat: '{title} | {event_name} {year}'
						}
					}
				]
			}
		})
	).resolves.toMatchObject({
		error: 'Set ANTHROPIC_API_KEY to generate title alternatives.'
	});
	expect(fetchMock).not.toHaveBeenCalled();
});

test('generateDescription sends transcript context and normalizes chapters', async () => {
	vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
		jsonResponse({
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						hook: 'Agent-native auth is changing how teams ship secure products.',
						metadata: [
							{
								label: 'Speaker',
								value: 'Chan, Developer Advocate, WorkOS'
							}
						],
						chapters: [
							{ timestamp: '0:00', title: 'Why agent auth matters' },
							{ timestamp: '1:00', title: 'Designing safer sessions' },
							{ timestamp: '2:00', title: 'Shipping the integration' }
						],
						links: [
							{
								label: 'WorkOS',
								url: 'https://workos.com',
								placeholder: ''
							}
						],
						description:
							'Agent-native auth is changing how teams ship secure products.\n\nSpeaker: Chan, Developer Advocate, WorkOS'
					})
				}
			]
		})
	);
	const t = convexTest(schema, modules);
	const result = await t.action(api.videoWorkflows.generateDescription, {
		input: {
			video: {
				youtubeVideoId: 'video-1',
				title: 'Build Agent-Native Auth',
				videoType: 'talk'
			},
			speakers: [
				{
					name: 'Chan',
					company: 'WorkOS',
					position: 'Developer Advocate'
				}
			],
			assignments: [
				{
					assignmentId: 'assignment-1',
					event: {
						name: 'MCP Night',
						editionTitle: 'Auth for Agents',
						year: 2026
					}
				}
			],
			caption: {
				language: 'en',
				name: 'English',
				trackKind: 'standard',
				body: `1
00:00:00,000 --> 00:00:30,000
Agent-native auth changes how product teams think about secure sessions.

2
00:01:00,000 --> 00:01:30,000
We design safer sessions by making authentication explicit and observable.

3
00:02:00,000 --> 00:02:30,000
The final step is shipping the integration without surprising users.

4
00:03:30,000 --> 00:04:00,000
Teams should leave with a practical path for their own implementation.
`
			},
			host: {
				label: 'WorkOS',
				url: 'https://workos.com'
			}
		}
	});
	const request = fetchMock.mock.calls[0][1] as RequestInit;
	const body = JSON.parse(request.body as string);
	const prompt = body.messages[0].content as string;

	expect(body.model).toBe('claude-opus-4-7');
	expect(body.output_config.effort).toBe('high');
	expect(prompt).toContain('Build Agent-Native Auth');
	expect(prompt).toContain('MCP Night: Auth for Agents');
	expect(prompt).toContain('[1:00] We design safer sessions');
	expect(result.error).toBeNull();
	expect(result.description).toMatchObject({
		hook: 'Agent-native auth is changing how teams ship secure products.',
		chapterTarget: 3,
		durationSeconds: 240
	});
	expect(result.description?.chapters.map((chapter) => chapter.timestamp)).toEqual([
		'0:00',
		'1:00',
		'2:00'
	]);
});
