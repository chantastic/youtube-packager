import { describe, expect, test } from 'vitest';
import {
	validateTitleEventSuffix,
	validateTitleFocus,
	validateVideoBaseline
} from './video-validation';

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

	test('passes when the first 55 characters lead with the hook', () => {
		expect(
			validateTitleFocus('Build Agent-Native Auth That Actually Works | RenderConf 2026', event)
		).toMatchObject({
			id: 'title-focus',
			status: 'pass',
			message: 'Hook is front-loaded'
		});
	});

	test('fails when the title starts with weak framing', () => {
		expect(validateTitleFocus('Overview of Agent-Native Auth | RenderConf 2026', event)).toMatchObject({
			id: 'title-focus',
			status: 'fail',
			message: 'Starts with weak framing'
		});
	});

	test('fails when the title starts with event metadata', () => {
		expect(validateTitleFocus('RenderConf 2026: Build Better Auth', event)).toMatchObject({
			id: 'title-focus',
			status: 'fail',
			message: 'Starts with event metadata'
		});
	});

	test('fails when the title starts with known speaker metadata', () => {
		expect(
			validateTitleFocus('Chan: Build Better Auth | RenderConf 2026', event, {
				speakers: [{ name: 'Chan', company: 'WorkOS' }]
			})
		).toMatchObject({
			id: 'title-focus',
			status: 'fail',
			message: 'Starts with speaker metadata'
		});
	});

	test('baseline validation returns the title suffix and first 55 checks', () => {
		expect(validateVideoBaseline('Build Better Auth | RenderConf 2026', event)).toHaveLength(2);
	});
});
