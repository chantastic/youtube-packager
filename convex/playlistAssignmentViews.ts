import { v } from 'convex/values';
import { query } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';
import type { Doc } from './_generated/dataModel';

export const getForEvent = query({
	args: {
		eventId: v.id('events')
	},
	handler: async (ctx, { eventId }) => {
		const organizationId = await requireOrganizationId(ctx);
		const event = await ctx.db.get(eventId);

		if (!documentBelongsToOrganization(event, organizationId)) {
			return [];
		}

		const scopedAssignments = await ctx.db
			.query('playlistAssignments')
			.withIndex('by_organizationId_and_eventId', (q) =>
				q.eq('organizationId', organizationId).eq('eventId', eventId)
			)
			.take(500);
		const legacyAssignments = await ctx.db
			.query('playlistAssignments')
			.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
			.take(500);
		const assignments = [
			...legacyAssignments.filter((assignment) => assignment.organizationId === undefined),
			...scopedAssignments
		];
		const rows: Array<{
			assignment: Doc<'playlistAssignments'>;
			video: Doc<'videos'>;
			speakers: Array<{
				assignment: Doc<'videoSpeakers'>;
				speaker: Doc<'speakers'>;
			}>;
		}> = [];

		for (const assignment of assignments.sort((a, b) => a.position - b.position)) {
			const video = await ctx.db.get(assignment.videoId);

			if (documentBelongsToOrganization(video, organizationId)) {
				const scopedSpeakerAssignments = await ctx.db
					.query('videoSpeakers')
					.withIndex('by_organizationId_and_videoId', (q) =>
						q.eq('organizationId', organizationId).eq('videoId', video._id)
					)
					.take(100);
				const legacySpeakerAssignments = await ctx.db
					.query('videoSpeakers')
					.withIndex('by_videoId', (q) => q.eq('videoId', video._id))
					.take(100);
				const speakerAssignments = [
					...legacySpeakerAssignments.filter(
						(speakerAssignment) => speakerAssignment.organizationId === undefined
					),
					...scopedSpeakerAssignments
				];
				const speakers = [];

				for (const speakerAssignment of speakerAssignments.sort(
					(a, b) => a.position - b.position
				)) {
					const speaker = await ctx.db.get(speakerAssignment.speakerId);

					if (documentBelongsToOrganization(speaker, organizationId)) {
						speakers.push({ assignment: speakerAssignment, speaker });
					}
				}

				rows.push({ assignment, video, speakers });
			}
		}

		return rows;
	}
});
