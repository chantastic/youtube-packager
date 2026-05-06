import { describe, expect, test } from 'vitest';
import {
	formatChapterTimestamp,
	parseSrtCues,
	recommendedChapterCount,
	transcriptDurationMs
} from './anthropic-description';

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
});
