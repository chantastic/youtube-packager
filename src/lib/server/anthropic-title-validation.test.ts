import { describe, expect, test } from 'vitest';
import { chunkTitleQualityInputs, parseTitleQualityResponse } from './anthropic-title-validation';

describe('Anthropic title validation parsing', () => {
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
					id: 'title-quality',
					label: 'Title quality',
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
					id: 'title-quality',
					label: 'Title quality',
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
});
