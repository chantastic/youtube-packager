import { describe, expect, test } from 'vitest';
import {
	buildTitleAiValidationInputs,
	titleAiValidationInputKey,
	validationsByCheckId
} from './title-ai-validation';

const enabledAiChecks = ['hook', 'mechanics'];

describe('title AI validation inputs', () => {
	test('builds hook and mechanics checks when event context is available', () => {
		const inputs = buildTitleAiValidationInputs({
			videoId: 'video-1',
			title: 'Build Better Auth — Chan, WorkOS | TestConf 2026',
			enabledTitleValidationIds: enabledAiChecks,
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

	test('returns no checks until the event opts in', () => {
		expect(
			buildTitleAiValidationInputs({
				videoId: 'video-1',
				title: 'Build Better Auth — Chan, WorkOS | TestConf 2026',
				event: {
					name: 'TestConf',
					year: 2026,
					titleFormat: '{title} | {event_name} {year}'
				}
			})
		).toEqual([]);
	});

	test('builds only mechanics when event context is not available', () => {
		expect(
			buildTitleAiValidationInputs({
				videoId: 'video-1',
				title: 'A Standalone Video Title',
				enabledTitleValidationIds: ['mechanics']
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

	test('skips disabled AI validation checks', () => {
		expect(
			buildTitleAiValidationInputs({
				videoId: 'video-1',
				title: 'Build Better Auth — Chan, WorkOS | TestConf 2026',
				enabledTitleValidationIds: enabledAiChecks,
				event: {
					name: 'TestConf',
					year: 2026,
					titleFormat: '{title} | {event_name} {year}'
				},
				disabledTitleValidationIds: ['hook']
			}).map((input) => input.checkId)
		).toEqual(['mechanics']);
	});

	test('returns no AI validation inputs when all AI checks are disabled', () => {
		expect(
			buildTitleAiValidationInputs({
				videoId: 'video-1',
				title: 'Build Better Auth — Chan, WorkOS | TestConf 2026',
				enabledTitleValidationIds: enabledAiChecks,
				event: {
					name: 'TestConf',
					year: 2026,
					titleFormat: '{title} | {event_name} {year}'
				},
				disabledTitleValidationIds: ['hook', 'mechanics']
			})
		).toEqual([]);
	});

	test('input key changes when the validation input changes', () => {
		const first = buildTitleAiValidationInputs({
			videoId: 'video-1',
			title: 'Build Better Auth | TestConf 2026',
			enabledTitleValidationIds: enabledAiChecks,
			event: {
				name: 'TestConf',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		});
		const second = buildTitleAiValidationInputs({
			videoId: 'video-1',
			title: 'Ship Better Auth | TestConf 2026',
			enabledTitleValidationIds: enabledAiChecks,
			event: {
				name: 'TestConf',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		});

		expect(titleAiValidationInputKey(first[0])).not.toBe(titleAiValidationInputKey(second[0]));
		expect(titleAiValidationInputKey(first[1])).not.toBe(titleAiValidationInputKey(second[1]));
	});

	test('input key is safe for Convex object fields', () => {
		const [input] = buildTitleAiValidationInputs({
			videoId: 'video-1',
			title: "Enterprises Don't Want AI — Peter White | HumanX 2026",
			enabledTitleValidationIds: ['hook'],
			event: {
				name: 'HumanX',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		});
		const key = titleAiValidationInputKey(input);

		expect(key).not.toContain('—');
		expect(key).toMatch(/^[\x20-\x7e]+$/);
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
