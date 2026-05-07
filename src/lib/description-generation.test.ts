import { describe, expect, test } from 'vitest';
import {
	descriptionFromResponse,
	descriptionPromptForInput,
	formatChapterTimestamp,
	parseSrtCues,
	recommendedChapterCount,
	transcriptDurationMs
} from './description-generation';

describe('anthropic description helpers', () => {
	test('parses SRT cues', () => {
		expect(
			parseSrtCues(`1
00:00:00,000 --> 00:00:02,000
Welcome to the session.

2
00:01:05,500 --> 00:01:09,000
We are building with WorkOS.
`)
		).toEqual([
			{
				startMs: 0,
				endMs: 2000,
				text: 'Welcome to the session.'
			},
			{
				startMs: 65500,
				endMs: 69000,
				text: 'We are building with WorkOS.'
			}
		]);
	});

	test('formats YouTube chapter timestamps', () => {
		expect(formatChapterTimestamp(0)).toBe('0:00');
		expect(formatChapterTimestamp(65_500)).toBe('1:05');
		expect(formatChapterTimestamp(3_665_000)).toBe('1:01:05');
	});

	test('computes transcript duration from cue end times', () => {
		expect(
			transcriptDurationMs([
				{ startMs: 0, endMs: 2_000, text: 'Intro' },
				{ startMs: 60_000, endMs: 75_000, text: 'Topic' }
			])
		).toBe(75_000);
	});

	test('recommends chapter count from duration', () => {
		expect(recommendedChapterCount(2 * 60_000)).toBe(0);
		expect(recommendedChapterCount(5 * 60_000)).toBe(3);
		expect(recommendedChapterCount(15 * 60_000)).toBe(6);
		expect(recommendedChapterCount(45 * 60_000)).toBe(10);
		expect(recommendedChapterCount(75 * 60_000)).toBe(12);
	});

	test('builds transcript, speaker, event, and link context for description generation', () => {
		const input = {
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
		};
		const prompt = descriptionPromptForInput(input).prompt;
		const result = descriptionFromResponse(
			input,
			JSON.stringify({
				hook: 'Agent-native auth is changing how teams ship secure products.',
				metadata: [
					{
						label: 'Speaker',
						value: 'Chan, Developer Advocate, WorkOS'
					},
					{
						label: 'Event',
						value: 'MCP Night: Auth for Agents'
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
					},
					{
						label: 'Chan profile',
						url: '',
						placeholder: 'TODO: add Chan profile URL'
					}
				],
				description:
					'Agent-native auth is changing how teams ship secure products.\n\nSpeaker: Chan, Developer Advocate, WorkOS'
			}),
			'claude-opus-4-7'
		);

		expect(prompt).toContain('Build Agent-Native Auth');
		expect(prompt).toContain('Chan');
		expect(prompt).toContain('Developer Advocate');
		expect(prompt).toContain('MCP Night: Auth for Agents');
		expect(prompt).toContain('https://workos.com');
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
});
