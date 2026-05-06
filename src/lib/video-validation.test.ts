import { describe, expect, test } from 'vitest';
import {
	validateSelectedTitleFormat,
	validateTitleEventSuffix,
	validateTitleFocus,
	validateTitleOverride,
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

	test('passes when title includes the rendered event suffix before other video metadata', () => {
		expect(
			validateTitleEventSuffix('Build Better Auth — Chan, WorkOS | RenderConf 2026 Keynote', event)
		).toMatchObject({
			id: 'title-event-suffix',
			status: 'pass',
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
		expect(
			validateTitleFocus('Overview of Agent-Native Auth | RenderConf 2026', event)
		).toMatchObject({
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

	test('validates titles against the selected composed video title format', () => {
		expect(
			validateSelectedTitleFormat('Build Better Auth — Chan, WorkOS | RenderConf 2026', event, {
				speaker: 'Chan',
				company: 'WorkOS',
				videoType: 'talk'
			})
		).toMatchObject({
			id: 'title-format',
			status: 'pass',
			message: 'Matches selected format',
			expected: 'Video Title — Chan, WorkOS | RenderConf 2026'
		});
	});

	test('fails when the selected title format suffix is missing', () => {
		expect(
			validateSelectedTitleFormat('Build Better Auth | RenderConf 2026', event, {
				speaker: 'Chan',
				company: 'WorkOS',
				videoType: 'talk'
			})
		).toMatchObject({
			id: 'title-format',
			status: 'fail',
			message: 'Does not match selected format',
			expected: 'Video Title — Chan, WorkOS | RenderConf 2026',
			details: ['End with "— Chan, WorkOS | RenderConf 2026".']
		});
	});

	test('validates titles against a full title override', () => {
		expect(
			validateTitleOverride('Build Agent Auth Without the Glue Code', {
				titleOverride: 'Build Agent Auth Without the Glue Code',
				videoType: 'talk'
			})
		).toMatchObject({
			id: 'title-override',
			status: 'pass',
			message: 'Matches override'
		});
		expect(
			validateTitleOverride('Build Better Auth | RenderConf 2026', {
				titleOverride: 'Build Agent Auth Without the Glue Code',
				videoType: 'talk'
			})
		).toMatchObject({
			id: 'title-override',
			status: 'fail',
			message: 'Does not match override',
			expected: 'Build Agent Auth Without the Glue Code'
		});
	});

	test('baseline validation includes selected title format when video context is provided', () => {
		const validations = validateVideoBaseline('Build Better Auth | RenderConf 2026', event, {
			video: {
				speaker: 'Chan',
				company: 'WorkOS',
				videoType: 'talk'
			}
		});

		expect(validations.map((validation) => validation.id)).toEqual([
			'title-event-suffix',
			'title-format',
			'title-focus'
		]);
	});

	test('baseline validation uses override checks instead of event suffix and format checks', () => {
		const validations = validateVideoBaseline('Build Agent Auth Without the Glue Code', event, {
			video: {
				titleOverride: 'Build Agent Auth Without the Glue Code',
				speaker: 'Chan',
				company: 'WorkOS',
				videoType: 'talk'
			}
		});

		expect(validations.map((validation) => validation.id)).toEqual([
			'title-override',
			'title-focus'
		]);
	});

	test('baseline validation returns the title suffix and first 55 checks', () => {
		expect(validateVideoBaseline('Build Better Auth | RenderConf 2026', event)).toHaveLength(2);
	});
});
