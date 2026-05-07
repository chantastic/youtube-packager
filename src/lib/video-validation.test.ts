import { describe, expect, test } from 'vitest';
import {
	validateSelectedTitleFormat,
	validateTitleEventSuffix,
	validateTitleFocus,
	validateTitleProfile,
	validateVideoBaseline,
	summarizeVideoValidations
} from './video-validation';

const event = {
	name: 'RenderConf',
	year: 2026,
	titleFormat: '{title} | {event_name} {year}'
};

describe('video validation', () => {
	test('passes when title includes the rendered event suffix', () => {
		expect(validateTitleEventSuffix('Keynote | RenderConf 2026', event)).toMatchObject({
			id: 'event',
			label: 'Event',
			status: 'pass',
			message: 'Includes event suffix',
			expected: '| RenderConf 2026'
		});
	});

	test('fails when title is missing the rendered event suffix', () => {
		expect(validateTitleEventSuffix('Keynote', event)).toMatchObject({
			id: 'event',
			status: 'fail',
			message: 'Missing event suffix',
			expected: '| RenderConf 2026'
		});
	});

	test('passes when title includes the rendered event suffix before other video metadata', () => {
		expect(
			validateTitleEventSuffix('Build Better Auth — Chan, WorkOS | RenderConf 2026 Keynote', event)
		).toMatchObject({
			id: 'event',
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
			id: 'event',
			status: 'info',
			message: 'No event suffix configured'
		});
	});

	test('passes when the first 55 characters lead with the hook', () => {
		expect(
			validateTitleFocus('Build Agent-Native Auth That Actually Works | RenderConf 2026', event)
		).toMatchObject({
			id: 'hook',
			label: 'Hook',
			status: 'pass',
			message: 'Hook is front-loaded'
		});
	});

	test('fails when the title starts with weak framing', () => {
		expect(
			validateTitleFocus('Overview of Agent-Native Auth | RenderConf 2026', event)
		).toMatchObject({
			id: 'hook',
			status: 'fail',
			message: 'Starts with weak framing'
		});
	});

	test('fails when the title starts with event metadata', () => {
		expect(validateTitleFocus('RenderConf 2026: Build Better Auth', event)).toMatchObject({
			id: 'hook',
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
			id: 'hook',
			status: 'fail',
			message: 'Starts with speaker metadata'
		});
	});

	test('validates presenter and company profile metadata', () => {
		expect(
			validateTitleProfile('Build Better Auth — Chan, WorkOS | RenderConf 2026', {
				speakers: [{ name: 'Chan', company: 'WorkOS' }],
				video: {
					speaker: 'Chan',
					company: 'WorkOS',
					videoType: 'talk'
				}
			})
		).toMatchObject({
			id: 'profile',
			label: 'Profile',
			status: 'pass',
			message: 'Includes presenter and company'
		});
	});

	test('fails profile validation when presenter or company is missing from the title', () => {
		expect(
			validateTitleProfile('Build Better Auth | RenderConf 2026', {
				speakers: [{ name: 'Chan', company: 'WorkOS' }],
				video: {
					speaker: 'Chan',
					company: 'WorkOS',
					videoType: 'talk'
				}
			})
		).toMatchObject({
			id: 'profile',
			status: 'fail',
			message: 'Missing presenter or company',
			details: ['Missing from title: Chan, WorkOS.']
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
			id: 'format',
			label: 'Format',
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
			id: 'format',
			status: 'fail',
			message: 'Does not match selected format',
			expected: 'Video Title — Chan, WorkOS | RenderConf 2026',
			details: ['End with "— Chan, WorkOS | RenderConf 2026".']
		});
	});

	test('baseline validation includes selected title format when video context is provided', () => {
		const validations = validateVideoBaseline(
			'Build Better Auth — Chan, WorkOS | RenderConf 2026',
			event,
			{
				speakers: [{ name: 'Chan', company: 'WorkOS' }],
				video: {
					speaker: 'Chan',
					company: 'WorkOS',
					videoType: 'talk'
				}
			}
		);

		expect(validations.map((validation) => validation.id)).toEqual(['profile', 'event', 'format']);
	});

	test('baseline validation excludes checks disabled on the video record', () => {
		const validations = validateVideoBaseline(
			'Build Better Auth — Chan, WorkOS | RenderConf 2026',
			event,
			{
				speakers: [{ name: 'Chan', company: 'WorkOS' }],
				video: {
					speaker: 'Chan',
					company: 'WorkOS',
					videoType: 'talk'
				},
				disabledTitleValidationIds: ['profile', 'format']
			}
		);

		expect(validations.map((validation) => validation.id)).toEqual(['event']);
	});

	test('aggregate validation stats only count active validations', () => {
		const validations = validateVideoBaseline(
			'Build Better Auth — Chan, WorkOS | RenderConf 2026',
			event,
			{
				speakers: [{ name: 'Chan', company: 'WorkOS' }],
				video: {
					speaker: 'Chan',
					company: 'WorkOS',
					videoType: 'talk'
				},
				disabledTitleValidationIds: ['profile']
			}
		);

		expect(summarizeVideoValidations([validations]).map((validation) => validation.id)).toEqual([
			'event',
			'format'
		]);
	});

	test('baseline validation omits profile when there is no video context', () => {
		const validations = validateVideoBaseline('Build Better Auth | RenderConf 2026', event);

		expect(validations.map((validation) => validation.id)).toEqual(['event']);
	});

	test('baseline validation uses overrides to opt out of profile, event, and format checks', () => {
		const validations = validateVideoBaseline('Build Agent Auth Without the Glue Code', event, {
			video: {
				titleOverride: 'Build Agent Auth Without the Glue Code',
				speaker: 'Chan',
				company: 'WorkOS',
				videoType: 'talk'
			}
		});

		expect(validations.map((validation) => validation.id)).toEqual([]);
	});
});
