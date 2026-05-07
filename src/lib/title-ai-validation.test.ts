import { describe, expect, test } from 'vitest';
import {
	buildTitleAiValidationInputs,
	titleAiValidationInputKey,
	validationsByCheckId
} from './title-ai-validation';

describe('title AI validation inputs', () => {
	test('builds hook and mechanics checks when event context is available', () => {
		const inputs = buildTitleAiValidationInputs({
			videoId: 'video-1',
			title: 'Build Better Auth — Chan, WorkOS | TestConf 2026',
			event: {
				name: 'TestConf',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			},
			video: {
				speaker: 'Chan',
				company: 'WorkOS',
				videoTitleFormat: '{title} — {speaker}, {company}'
			},
			speakers: [
				{
					name: 'Chan',
					company: 'WorkOS',
					position: 'Developer Advocate'
				}
			]
		});

		expect(inputs.map((input) => input.checkId)).toEqual(['hook', 'mechanics']);
		expect(inputs[0]).toMatchObject({
			videoId: 'video-1',
			field: 'title',
			checkId: 'hook',
			label: 'Hook',
			input: {
				title: 'Build Better Auth — Chan, WorkOS | TestConf 2026',
				hookText: 'Build Better Auth',
				hookSource: 'Build Better Auth',
				maxHookLength: 55,
				event: {
					name: 'TestConf',
					editionTitle: null,
					year: 2026
				},
				video: {
					videoType: null,
					videoTitleFormat: '{title} — {speaker}, {company}'
				},
				speakers: [
					{
						name: 'Chan',
						company: 'WorkOS',
						position: 'Developer Advocate'
					}
				]
			}
		});
		expect(inputs[1]).toMatchObject({
			checkId: 'mechanics',
			label: 'Mechanics',
			input: {
				title: 'Build Better Auth — Chan, WorkOS | TestConf 2026'
			}
		});
	});

	test('builds only mechanics when event context is not available', () => {
		expect(
			buildTitleAiValidationInputs({
				videoId: 'video-1',
				title: 'A Standalone Video Title'
			})
		).toEqual([
			{
				videoId: 'video-1',
				field: 'title',
				checkId: 'mechanics',
				label: 'Mechanics',
				input: {
					title: 'A Standalone Video Title'
				}
			}
		]);
	});

	test('input key changes when the validation input changes', () => {
		const first = buildTitleAiValidationInputs({
			videoId: 'video-1',
			title: 'Build Better Auth | TestConf 2026',
			event: {
				name: 'TestConf',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		});
		const second = buildTitleAiValidationInputs({
			videoId: 'video-1',
			title: 'Ship Better Auth | TestConf 2026',
			event: {
				name: 'TestConf',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		});

		expect(titleAiValidationInputKey(first[0])).not.toBe(titleAiValidationInputKey(second[0]));
		expect(titleAiValidationInputKey(first[1])).not.toBe(titleAiValidationInputKey(second[1]));
	});

	test('indexes validations by check id', () => {
		expect(
			validationsByCheckId([
				{
					id: 'hook',
					label: 'Hook',
					status: 'fail',
					message: 'Too vague'
				},
				{
					id: 'mechanics',
					label: 'Mechanics',
					status: 'pass',
					message: 'Looks clean'
				}
			])
		).toEqual({
			hook: {
				id: 'hook',
				label: 'Hook',
				status: 'fail',
				message: 'Too vague'
			},
			mechanics: {
				id: 'mechanics',
				label: 'Mechanics',
				status: 'pass',
				message: 'Looks clean'
			}
		});
	});
});
