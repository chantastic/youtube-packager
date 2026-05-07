import { describe, expect, test } from 'vitest';
import {
	deriveComposedBaseTitle,
	formatComposedVideoTitle,
	formatVideoTitle,
	formatVideoRecordTitle,
	getDefaultVideoTypeTitleFormat,
	getDefaultVideoTitleFormat,
	getTitleHookParts,
	normalizeVideoType,
	normalizeVideoTitleFormat
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

	test('uses panel discussion instead of speaker and company metadata', () => {
		expect(getDefaultVideoTypeTitleFormat('panelDiscussion')).toBe(
			'{title} — Panel Discussion {event_suffix}'
		);
		expect(
			formatVideoRecordTitle(undefined, 'Building AuthKit', {
				speaker: 'Chan, Michael, Sarah',
				company: 'WorkOS, Acme',
				videoType: 'panelDiscussion'
			})
		).toBe('Building AuthKit — Panel Discussion');
	});

	test('formats panel discussions with the event suffix after the type', () => {
		expect(
			formatComposedVideoTitle(
				'The Future of Agentic AI: Why MCP Moved to the Linux Foundation',
				{ videoType: 'panelDiscussion' },
				{ name: 'MCP Night', titleFormat: '{title} | {event_name}' }
			)
		).toBe(
			'The Future of Agentic AI: Why MCP Moved to the Linux Foundation — Panel Discussion | MCP Night'
		);
	});

	test('uses type-specific defaults when no custom video format is set', () => {
		expect(normalizeVideoTitleFormat(undefined, 'panelDiscussion')).toBe('{title} — {video_type}');
		expect(getDefaultVideoTitleFormat('interview')).toBe('{title} — {speaker}, {company}');
		expect(getDefaultVideoTypeTitleFormat('interview')).toBe(
			'{title} — {speaker}, {company} {event_suffix}'
		);
		expect(
			formatVideoRecordTitle(undefined, 'Building AuthKit', {
				speaker: 'Chan',
				company: 'WorkOS',
				videoType: 'interview'
			})
		).toBe('Building AuthKit — Chan, WorkOS');
	});

	test('normalizes unknown video types to the Talk template', () => {
		expect(normalizeVideoType('unknown')).toBe('talk');
		expect(getDefaultVideoTypeTitleFormat('talk')).toBe(
			'{title} — {speaker}, {company} {event_suffix}'
		);
		expect(
			formatComposedVideoTitle(
				'Building AuthKit',
				{ speaker: 'Chan', company: 'WorkOS' },
				{ name: 'Launch Week', year: 2026, titleFormat: '{title} | {event_name} {year}' }
			)
		).toBe('Building AuthKit — Chan, WorkOS | Launch Week 2026');
	});

	test('only honors custom video formats for the custom video type', () => {
		expect(normalizeVideoTitleFormat('{title} with {speaker}', 'talk')).toBe(
			getDefaultVideoTitleFormat('talk')
		);
		expect(normalizeVideoTitleFormat('{title} with {speaker}', 'custom')).toBe(
			'{title} with {speaker}'
		);
		expect(
			formatVideoRecordTitle('{title} with {speaker}', 'Building AuthKit', {
				speaker: 'Chan',
				company: 'WorkOS',
				videoType: 'talk'
			})
		).toBe('Building AuthKit — Chan, WorkOS');
		expect(
			formatVideoRecordTitle('{title} with {speaker}', 'Building AuthKit', {
				speaker: 'Chan',
				company: 'WorkOS',
				videoType: 'custom'
			})
		).toBe('Building AuthKit with Chan');
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

	test('uses a full title override instead of the composed format', () => {
		expect(
			formatComposedVideoTitle(
				'Building AuthKit',
				{
					speaker: 'Chan',
					company: 'WorkOS',
					titleOverride: 'Build Agent Auth Without the Glue Code',
					videoType: 'talk'
				},
				{ name: 'Launch Week', year: 2026, titleFormat: '{title} | {event_name} {year}' }
			)
		).toBe('Build Agent Auth Without the Glue Code');
	});

	test('uses a composed keynote format with the event name and video type', () => {
		expect(getDefaultVideoTypeTitleFormat('keynote')).toBe(
			'{title} — {speaker}, {company} {event_suffix} {video_type}'
		);
		expect(
			formatComposedVideoTitle(
				'Building AuthKit',
				{ speaker: 'Chan', company: 'WorkOS', videoType: 'keynote' },
				{ name: 'Launch Week', year: 2026, titleFormat: '{title} | {event_name} {year}' }
			)
		).toBe('Building AuthKit — Chan, WorkOS | Launch Week 2026 Keynote');
	});

	test('custom video title formats can compose video and event metadata', () => {
		expect(
			formatComposedVideoTitle(
				'Building AuthKit',
				{
					speaker: 'Chan',
					company: 'WorkOS',
					videoType: 'custom',
					videoTitleFormat: '{event_name}: {title} — {speaker}, {company} ({year})'
				},
				{ name: 'Launch Week', year: 2026, titleFormat: '{title} | {event_name} {year}' }
			)
		).toBe('Launch Week: Building AuthKit — Chan, WorkOS (2026)');
	});

	test('keeps edition title out of the default event suffix', () => {
		expect(
			formatVideoTitle(undefined, 'Building AuthKit', {
				name: 'MCP Night',
				editionTitle: 'Auth for Agents',
				year: 2026
			})
		).toBe('Building AuthKit | MCP Night 2026');
	});

	test('supports edition title when the format explicitly includes it', () => {
		expect(
			formatVideoTitle('{title} | {event_name}: {edition_title} {year}', 'Building AuthKit', {
				name: 'MCP Night',
				editionTitle: 'Auth for Agents',
				year: 2026
			})
		).toBe('Building AuthKit | MCP Night: Auth for Agents 2026');
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

	test('derives the base title from a keynote title', () => {
		expect(
			deriveComposedBaseTitle(
				'Building AuthKit — Chan, WorkOS | Launch Week 2026 Keynote',
				{ speaker: 'Chan', company: 'WorkOS', videoType: 'keynote' },
				{ name: 'Launch Week', year: 2026, titleFormat: '{title} | {event_name} {year}' }
			)
		).toBe('Building AuthKit');
	});

	test('uses the composed title segment as the hook source before format metadata', () => {
		expect(
			getTitleHookParts(
				'The Future of Agentic AI: Why MCP Moved to the Linux Foundation — Panel Discussion | MCP Night',
				{ name: 'MCP Night', titleFormat: '{title} | {event_name}' },
				{ videoType: 'panelDiscussion' },
				55
			)
		).toMatchObject({
			source: 'The Future of Agentic AI: Why MCP Moved to the Linux Foundation',
			focus: 'The Future of Agentic AI: Why MCP Moved to the Linux Fo',
			rest: 'undation'
		});
	});
});
