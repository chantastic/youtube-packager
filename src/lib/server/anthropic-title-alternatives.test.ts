import { describe, expect, test } from 'vitest';
import {
	buildTitleAlternativesPrompt,
	finalizeTitleAlternatives,
	parseTitleAlternativesResponse
} from './anthropic-title-alternatives';

describe('Anthropic title alternatives', () => {
	test('accepts fenced JSON', () => {
		expect(
			parseTitleAlternativesResponse(
				'```json\n{"results":[{"assignmentId":"assignment-1","baseTitles":["A Better Title"]}]}\n```'
			)
		).toEqual({
			results: [
				{
					assignmentId: 'assignment-1',
					baseTitles: ['A Better Title']
				}
			]
		});
	});

	test('formats alternatives with event rules and filters titles over 100 characters', () => {
		const alternatives = finalizeTitleAlternatives(
			[
				'A Better Title',
				'A Better Title',
				'This title is intentionally very long and should be filtered because the event suffix makes it exceed the YouTube maximum'
			],
			'Current Title — Chan, WorkOS | TestConf 2026',
			{
				speaker: 'Chan',
				company: 'WorkOS',
				videoTitleFormat: '{title} — {speaker}, {company}'
			},
			{
				name: 'TestConf',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		);

		expect(alternatives).toEqual(['A Better Title — Chan, WorkOS | TestConf 2026']);
		expect(alternatives[0].length).toBeLessThanOrEqual(100);
	});

	test('filters alternatives that fail the first 55 character check', () => {
		const alternatives = finalizeTitleAlternatives(
			['Overview of Agent-Native Auth', 'Build Agent-Native Auth That Works'],
			'Current Title — Chan, WorkOS | TestConf 2026',
			{
				speaker: 'Chan',
				company: 'WorkOS',
				videoTitleFormat: '{title} — {speaker}, {company}'
			},
			{
				name: 'TestConf',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		);

		expect(alternatives).toEqual([
			'Build Agent-Native Auth That Works — Chan, WorkOS | TestConf 2026'
		]);
	});

	test('formats panel discussion alternatives without individual speaker metadata', () => {
		const alternatives = finalizeTitleAlternatives(
			['Build Agent-Native Auth That Works'],
			'Current Title — Chan, WorkOS | TestConf 2026',
			{
				speaker: 'Chan, Michael, Sarah',
				company: 'WorkOS, Acme',
				videoType: 'panelDiscussion'
			},
			{
				name: 'TestConf',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		);

		expect(alternatives).toEqual([
			'Build Agent-Native Auth That Works — Panel Discussion | TestConf 2026'
		]);
	});

	test('formats keynote alternatives with the keynote event suffix', () => {
		const alternatives = finalizeTitleAlternatives(
			['Build Agent-Native Auth That Works'],
			'Current Title — Chan, WorkOS | TestConf 2026 Keynote',
			{
				speaker: 'Chan',
				company: 'WorkOS',
				videoType: 'keynote'
			},
			{
				name: 'TestConf',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		);

		expect(alternatives).toEqual([
			'Build Agent-Native Auth That Works — Chan, WorkOS | TestConf 2026 Keynote'
		]);
	});

	test('includes title validation warnings in the generation prompt', () => {
		const prompt = buildTitleAlternativesPrompt({
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
					},
					titleValidations: [
						{
							id: 'hook',
							label: 'Hook',
							status: 'fail',
							message: 'Starts with weak framing',
							details: ['"Overview" wastes prime title space.'],
							expected: 'Clear topic or hook in the first 55 characters'
						},
						{
							id: 'format',
							label: 'Format',
							status: 'pass',
							message: 'Matches selected format'
						}
					]
				}
			]
		});

		expect(prompt).toContain('Use titleWarnings as feedback');
		expect(prompt).toContain('"titleWarnings"');
		expect(prompt).toContain('Starts with weak framing');
		expect(prompt).not.toContain('Matches selected format');
	});
});
