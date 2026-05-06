import { describe, expect, test } from 'vitest';
import {
	deriveComposedBaseTitle,
	formatComposedVideoTitle,
	formatVideoRecordTitle
} from './title-format';

describe('title formatting', () => {
	test('formats video titles with speaker and company', () => {
		expect(
			formatVideoRecordTitle(undefined, 'Building AuthKit', {
				speaker: 'Chan',
				company: 'WorkOS'
			})
		).toBe('Building AuthKit — Chan, WorkOS');
	});

	test('cleans dangling speaker punctuation when metadata is missing', () => {
		expect(formatVideoRecordTitle(undefined, 'Building AuthKit', {})).toBe('Building AuthKit');
		expect(formatVideoRecordTitle(undefined, 'Building AuthKit', { speaker: 'Chan' })).toBe(
			'Building AuthKit — Chan'
		);
	});

	test('composes video and playlist title formats', () => {
		expect(
			formatComposedVideoTitle(
				'Building AuthKit',
				{ speaker: 'Chan', company: 'WorkOS' },
				{ name: 'Launch Week', year: 2026, titleFormat: '{title} | {event_name} {year}' }
			)
		).toBe('Building AuthKit — Chan, WorkOS | Launch Week 2026');
	});

	test('derives the base title from a composed title', () => {
		expect(
			deriveComposedBaseTitle(
				'Building AuthKit — Chan, WorkOS | Launch Week 2026',
				{ speaker: 'Chan', company: 'WorkOS' },
				{ name: 'Launch Week', year: 2026, titleFormat: '{title} | {event_name} {year}' }
			)
		).toBe('Building AuthKit');
	});
});
