import { describe, expect, test } from 'vitest';
import { parseTitleQualityResponse } from './anthropic-title-validation';

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
});
