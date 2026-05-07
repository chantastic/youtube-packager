import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	chunkTitleQualityInputs,
	parseTitleAiValidationResponse,
	parseTitleQualityResponse,
	validateTitleAiChecksWithAnthropic
} from './anthropic-title-validation';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}

describe('Anthropic title validation parsing', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.doUnmock('$env/dynamic/private');
		vi.resetModules();
		vi.restoreAllMocks();
	});

	test('maps JSON results to validation objects', () => {
		expect(
			parseTitleQualityResponse(
				JSON.stringify({
					results: [
						{
							videoId: 'abc123',
							status: 'fail',
							message: 'Possible grammar issue',
							details: ['Use sentence case for readability.'],
							suggested: 'A clearer title'
						}
					]
				})
			)
		).toEqual({
			abc123: [
				{
					id: 'mechanics',
					label: 'Mechanics',
					status: 'fail',
					message: 'Possible grammar issue',
					details: ['Use sentence case for readability.'],
					suggested: 'A clearer title'
				}
			]
		});
	});

	test('accepts fenced JSON', () => {
		expect(
			parseTitleQualityResponse(
				'```json\n{"results":[{"videoId":"abc123","status":"pass","message":"Looks clean"}]}\n```'
			)
		).toEqual({
			abc123: [
				{
					id: 'mechanics',
					label: 'Mechanics',
					status: 'pass',
					message: 'Looks clean'
				}
			]
		});
	});

	test('omits null optional fields from Anthropic responses', () => {
		expect(
			parseTitleQualityResponse(
				JSON.stringify({
					results: [
						{
							videoId: 'abc123',
							status: 'pass',
							message: 'Looks clean',
							details: [],
							suggested: null
						}
					]
				})
			)
		).toEqual({
			abc123: [
				{
					id: 'mechanics',
					label: 'Mechanics',
					status: 'pass',
					message: 'Looks clean'
				}
			]
		});
	});

	test('chunks title inputs before sending them to Anthropic', () => {
		const titles = Array.from({ length: 45 }, (_, index) => ({
			videoId: `video-${index + 1}`,
			title: `Video ${index + 1}`
		}));

		const batches = chunkTitleQualityInputs(titles);

		expect(batches.map((batch) => batch.length)).toEqual([20, 20, 5]);
		expect(batches[0][0]).toEqual({ videoId: 'video-1', title: 'Video 1' });
		expect(batches[2][4]).toEqual({ videoId: 'video-45', title: 'Video 45' });
	});

	test('maps mixed AI validation responses by request id', () => {
		expect(
			parseTitleAiValidationResponse(
				JSON.stringify({
					results: [
						{
							requestId: 'video-1:title:hook',
							status: 'fail',
							message: 'Too vague'
						},
						{
							requestId: 'video-1:title:mechanics',
							status: 'pass',
							message: 'Looks clean'
						}
					]
				}),
				[
					{
						requestId: 'video-1:title:hook',
						videoId: 'video-1',
						checkId: 'hook',
						label: 'Hook',
						input: { hookText: 'Intro to Auth' }
					},
					{
						requestId: 'video-1:title:mechanics',
						videoId: 'video-1',
						checkId: 'mechanics',
						label: 'Mechanics',
						input: { title: 'Intro to Auth' }
					}
				]
			)
		).toEqual({
			'video-1:title:hook': {
				id: 'hook',
				label: 'Hook',
				status: 'fail',
				message: 'Too vague'
			},
			'video-1:title:mechanics': {
				id: 'mechanics',
				label: 'Mechanics',
				status: 'pass',
				message: 'Looks clean'
			}
		});
	});

	test('does not call Anthropic when the API key is missing', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: {
				ANTHROPIC_API_KEY: ''
			}
		}));
		const { validateTitleAiChecksWithAnthropic } = await import('./anthropic-title-validation');
		const fetchMock = vi.spyOn(globalThis, 'fetch');

		await expect(
			validateTitleAiChecksWithAnthropic([
				{
					requestId: 'video-1:title:hook',
					videoId: 'video-1',
					field: 'title',
					checkId: 'hook',
					label: 'Hook',
					input: { title: 'Overview of Auth', hookText: 'Overview of Auth' }
				}
			])
		).resolves.toEqual({
			validationsByRequestId: {},
			error: 'Set ANTHROPIC_API_KEY to run AI title checks.'
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('reports truncated Anthropic validation responses', async () => {
		vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			jsonResponse({ stop_reason: 'max_tokens' })
		);

		await expect(
			validateTitleAiChecksWithAnthropic([
				{
					requestId: 'video-1:title:hook',
					videoId: 'video-1',
					field: 'title',
					checkId: 'hook',
					label: 'Hook',
					input: { title: 'Overview of Auth', hookText: 'Overview of Auth' }
				}
			])
		).resolves.toEqual({
			validationsByRequestId: {},
			error: 'Anthropic title validation response was truncated. Try a smaller batch.'
		});
	});

	test('reports unavailable Anthropic validation models with the configured model name', async () => {
		vi.doMock('$env/dynamic/private', () => ({
			env: {
				ANTHROPIC_API_KEY: 'test-api-key',
				ANTHROPIC_MODEL: 'claude-missing-model'
			}
		}));
		const { validateTitleAiChecksWithAnthropic } = await import('./anthropic-title-validation');
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			jsonResponse(
				{
					error: {
						message: 'model: claude-missing-model not found'
					}
				},
				400
			)
		);

		await expect(
			validateTitleAiChecksWithAnthropic([
				{
					requestId: 'video-1:title:mechanics',
					videoId: 'video-1',
					field: 'title',
					checkId: 'mechanics',
					label: 'Mechanics',
					input: { title: 'Build Better Auth' }
				}
			])
		).resolves.toEqual({
			validationsByRequestId: {},
			error:
				'Anthropic title validation could not use model "claude-missing-model". Set ANTHROPIC_MODEL to a model available for this API key.'
		});
	});

	test('reports unreadable Anthropic validation JSON', async () => {
		vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			jsonResponse({
				content: [
					{
						type: 'text',
						text: 'not json'
					}
				]
			})
		);

		await expect(
			validateTitleAiChecksWithAnthropic([
				{
					requestId: 'video-1:title:mechanics',
					videoId: 'video-1',
					field: 'title',
					checkId: 'mechanics',
					label: 'Mechanics',
					input: { title: 'Build Better Auth' }
				}
			])
		).resolves.toEqual({
			validationsByRequestId: {},
			error: 'Anthropic returned an unreadable title validation response.'
		});
	});
});
