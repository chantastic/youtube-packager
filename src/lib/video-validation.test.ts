import { describe, expect, test } from 'vitest';
import { validateTitleEventSuffix, validateVideoBaseline } from './video-validation';

const event = {
	name: 'RenderConf',
	year: 2026,
	titleFormat: '{title} | {event_name} {year}'
};

describe('video validation', () => {
	test('passes when title includes the rendered event suffix', () => {
		expect(validateTitleEventSuffix('Keynote | RenderConf 2026', event)).toMatchObject({
			id: 'title-event-suffix',
			status: 'pass',
			message: 'Includes event suffix',
			expected: '| RenderConf 2026'
		});
	});

	test('fails when title is missing the rendered event suffix', () => {
		expect(validateTitleEventSuffix('Keynote', event)).toMatchObject({
			id: 'title-event-suffix',
			status: 'fail',
			message: 'Missing event suffix',
			expected: '| RenderConf 2026'
		});
	});

	test('returns info when a title format has no suffix after title', () => {
		expect(
			validateTitleEventSuffix('RenderConf 2026 Keynote', {
				...event,
				titleFormat: '{event_name} {year}: {title}'
			})
		).toMatchObject({
			id: 'title-event-suffix',
			status: 'info',
			message: 'No event suffix configured'
		});
	});

	test('baseline validation returns the title suffix check', () => {
		expect(validateVideoBaseline('Keynote | RenderConf 2026', event)).toHaveLength(1);
	});
});
