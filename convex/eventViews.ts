import { v } from 'convex/values';
import { query } from './_generated/server';
import { documentBelongsToOrganization, requireOrganizationId } from './authz';
import {
	getPlaylistAssignmentRowsForEvent,
	type PlaylistAssignmentRow
} from './playlistAssignmentViews';
import { buildTitleAiValidationInputs } from '../src/lib/title-ai-validation';
import { validateVideoBaseline } from '../src/lib/video-validation';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

export const getList = query({
	args: {},
	handler: async (ctx) => {
		const organizationId = await requireOrganizationId(ctx);
		const events = await ctx.db
			.query('events')
			.withIndex('by_organizationId', (q) => q.eq('organizationId', organizationId))
			.order('asc')
			.take(100);
		const items = [];

		for (const event of events) {
			items.push(await buildEventView(ctx, event, organizationId));
		}

		return items;
	}
});

export const getDetail = query({
	args: {
		eventId: v.id('events')
	},
	handler: async (ctx, { eventId }) => {
		const organizationId = await requireOrganizationId(ctx);
		const event = await ctx.db.get(eventId);

		return documentBelongsToOrganization(event, organizationId)
			? await buildEventView(ctx, event, organizationId)
			: null;
	}
});

async function buildEventView(ctx: QueryCtx, event: Doc<'events'>, organizationId: string) {
	const [playlistStats, assignmentRows] = await Promise.all([
		findPlaylistStatsForEvent(ctx, event._id, organizationId),
		event.youtubePlaylistId
			? getPlaylistAssignmentRowsForEvent(ctx, event._id, organizationId)
			: Promise.resolve([])
	]);

	return {
		event,
		playlistStats,
		videos: assignmentRows.map((row) => ({
			...row,
			baselineValidations: validateVideoBaseline(row.video.title, event, {
				speakers: speakerRecordsForValidation(row),
				video: videoRecordForValidation(row),
				disabledTitleValidationIds: row.video.disabledTitleValidationIds
			}),
			titleAiInputs: buildTitleAiValidationInputs({
				videoId: row.video._id,
				title: row.video.title,
				event,
				speakers: speakerRecordsForValidation(row),
				video: videoRecordForValidation(row),
				disabledTitleValidationIds: row.video.disabledTitleValidationIds
			})
		}))
	};
}

async function findPlaylistStatsForEvent(
	ctx: QueryCtx,
	eventId: Id<'events'>,
	organizationId: string
) {
	return await ctx.db
		.query('eventPlaylistStats')
		.withIndex('by_organizationId_and_eventId', (q) =>
			q.eq('organizationId', organizationId).eq('eventId', eventId)
		)
		.unique();
}

function speakerRecordsForValidation(row: PlaylistAssignmentRow) {
	return row.speakers.map((speakerRow) => ({
		name: speakerRow.speaker.name,
		...(speakerRow.speaker.company !== undefined ? { company: speakerRow.speaker.company } : {}),
		...(speakerRow.speaker.position !== undefined ? { position: speakerRow.speaker.position } : {})
	}));
}

function videoRecordForValidation(row: PlaylistAssignmentRow) {
	const speaker = row.speakers.map((speakerRow) => speakerRow.speaker.name).join(', ');
	const company = [
		...new Set(
			row.speakers
				.map((speakerRow) => speakerRow.speaker.company)
				.filter((value): value is string => Boolean(value))
		)
	].join(', ');
	const position = [
		...new Set(
			row.speakers
				.map((speakerRow) => speakerRow.speaker.position)
				.filter((value): value is string => Boolean(value))
		)
	].join(', ');

	return {
		speaker: speaker || undefined,
		company: company || undefined,
		position: position || undefined,
		titleOverride: row.video.titleOverride,
		videoTitleFormat: row.video.videoTitleFormat,
		videoType: row.video.videoType
	};
}
