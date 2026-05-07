import { describe, expect, test } from 'vitest';
import {
	buildTitleAlternativesInput,
	prepareTitleAlternativesValidationContext,
	type TitleAlternativesVideoView
} from './title-alternatives-context';

const videoView = {
	video: {
		_id: 'video-record-1',
		youtubeVideoId: 'video-1',
		title: 'Build Agent-Native Auth — Chan, WorkOS | MCP Night 2026',
		description: 'A practical talk about agent-native authentication.',
		channelTitle: 'WorkOS',
		publishedAt: '2026-01-01T00:00:00Z',
		videoPublishedAt: '2026-01-01T00:00:00Z',
		videoTitleFormat: '{title} — {speaker}, {company}',
		videoType: 'talk'
	},
	speakers: [
		{
			speaker: {
				name: 'Chan',
				company: 'WorkOS',
				position: 'Developer Advocate'
			}
		}
	],
	assignments: [
		{
			assignment: {
				_id: 'assignment-1'
			},
			event: {
				name: 'MCP Night',
				year: 2026,
				titleFormat: '{title} | {event_name} {year}'
			}
		}
	]
} satisfies TitleAlternativesVideoView;

describe('title alternatives context', () => {
	test('prepares video, speaker, and AI validation inputs for title generation', () => {
		const context = prepareTitleAlternativesValidationContext(videoView);

		expect(context.videoRecord).toEqual({
			speaker: 'Chan',
			company: 'WorkOS',
			position: 'Developer Advocate',
			titleOverride: undefined,
			videoTitleFormat: '{title} — {speaker}, {company}',
			videoType: 'talk'
		});
		expect(context.speakerContext).toEqual([
			{
				name: 'Chan',
				company: 'WorkOS',
				position: 'Developer Advocate'
			}
		]);
		expect([...context.aiInputsByKey.values()].map((input) => input.checkId)).toEqual([
			'hook',
			'mechanics'
		]);
		expect([...context.aiInputsByKey.values()].map((input) => input.videoId)).toEqual([
			'video-record-1',
			'video-record-1'
		]);
		expect(context.aiInputKeysByAssignmentId.get('assignment-1')).toHaveLength(2);
	});

	test('builds generation input with static and cached AI title validations', () => {
		const context = prepareTitleAlternativesValidationContext(videoView);
		const aiValidationsByInputKey = new Map(
			[...context.aiInputsByKey.entries()].map(([inputKey, input]) => [
				inputKey,
				{
					id: input.checkId,
					label: input.label,
					status: input.checkId === 'hook' ? ('fail' as const) : ('pass' as const),
					message: input.checkId === 'hook' ? 'Starts with weak framing' : 'Looks clean'
				}
			])
		);

		const input = buildTitleAlternativesInput(videoView, context, aiValidationsByInputKey);

		expect(input).toMatchObject({
			currentTitle: 'Build Agent-Native Auth — Chan, WorkOS | MCP Night 2026',
			description: 'A practical talk about agent-native authentication.',
			video: {
				speaker: 'Chan',
				company: 'WorkOS'
			},
			videoContext: {
				youtubeVideoId: 'video-1',
				channelTitle: 'WorkOS'
			}
		});
		expect(input.assignments[0].titleValidations?.map((validation) => validation.id)).toEqual([
			'profile',
			'event',
			'format',
			'hook',
			'mechanics'
		]);
		expect(input.assignments[0].titleValidations).toContainEqual({
			id: 'hook',
			label: 'Hook',
			status: 'fail',
			message: 'Starts with weak framing'
		});
	});
});
