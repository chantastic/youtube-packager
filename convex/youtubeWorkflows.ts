'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import {
	downloadYouTubeCaptionTrack,
	getYouTubePlaylistData,
	getYouTubeVideoData,
	listAuthorizedYouTubeChannels,
	listYouTubeCaptionTracks,
	updateYouTubeVideoTitle,
	YouTubeDataApiError,
	type AuthorizedYouTubeChannel,
	type PublicPlaylistData,
	type PublicVideoData,
	type YouTubeCaptionTrack
} from '../src/lib/server/youtube-data-api';
import { getConnectedYouTubeAccessToken, WorkOSPipesProviderError } from './workosPipesProvider';
import type { Id } from './_generated/dataModel';
import type { ActionCtx } from './_generated/server';

export const syncPlaylistForJob = internalAction({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (
		ctx,
		{ jobId }
	): Promise<{ playlist: PublicPlaylistData | null; error: string | null }> => {
		const context = await ctx.runQuery(
			internal.youtubeWorkflowViews.getPlaylistSyncContextInternal,
			{ jobId }
		);

		if (!context.job || !context.event) {
			await recordContextError(ctx, jobId, context.error);
			return { playlist: null, error: context.error };
		}

		await ctx.runMutation(internal.workflowJobCommands.recordRunningInternal, { jobId });

		try {
			const accessToken = await getConnectedYouTubeAccessToken({
				userId: context.job.requestedByUserId,
				organizationId: context.job.organizationId
			});
			const playlistId = context.event.youtubePlaylistId;

			if (!playlistId) {
				throw new Error('Link a playlist before syncing videos.');
			}

			const playlist = await getYouTubePlaylistData(playlistId, accessToken);

			await ctx.runMutation(internal.videoCommands.recordPlaylistSnapshotByEventIdInternal, {
				organizationId: context.job.organizationId,
				eventId: context.event._id,
				playlist: {
					playlistId: playlist.playlistId,
					...(playlist.channelId !== undefined ? { youtubeChannelId: playlist.channelId } : {}),
					...(playlist.title !== undefined ? { title: playlist.title } : {}),
					...(playlist.channelTitle !== undefined ? { channelTitle: playlist.channelTitle } : {}),
					...(playlist.itemCount !== undefined ? { itemCount: playlist.itemCount } : {}),
					videos: playlist.videos.map((video) => ({
						playlistItemId: video.playlistItemId,
						youtubeVideoId: video.videoId,
						...(video.channelId !== undefined ? { youtubeChannelId: video.channelId } : {}),
						title: video.title,
						position: video.position,
						videoUrl: video.videoUrl,
						playlistVideoUrl: video.playlistVideoUrl,
						studioEditUrl: video.studioEditUrl,
						...(video.description !== undefined ? { description: video.description } : {}),
						...(video.thumbnailUrl !== undefined ? { thumbnailUrl: video.thumbnailUrl } : {}),
						...(video.channelTitle !== undefined ? { channelTitle: video.channelTitle } : {}),
						...(video.publishedAt !== undefined ? { publishedAt: video.publishedAt } : {}),
						...(video.videoPublishedAt !== undefined
							? { videoPublishedAt: video.videoPublishedAt }
							: {})
					}))
				}
			});

			await ctx.runMutation(internal.workflowJobCommands.recordCompleteInternal, {
				jobId,
				result: JSON.stringify({
					playlistId: playlist.playlistId,
					videoCount: playlist.videos.length
				})
			});

			return { playlist, error: null };
		} catch (error) {
			return { playlist: null, error: await recordWorkflowError(ctx, jobId, error) };
		}
	}
});

export const refreshVideoForJob = internalAction({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (
		ctx,
		{ jobId }
	): Promise<{ video: PublicVideoData | null; error: string | null }> => {
		const context = await ctx.runQuery(
			internal.youtubeWorkflowViews.getVideoRefreshContextInternal,
			{ jobId }
		);

		if (!context.job || !context.video) {
			await recordContextError(ctx, jobId, context.error);
			return { video: null, error: context.error };
		}

		await ctx.runMutation(internal.workflowJobCommands.recordRunningInternal, { jobId });

		try {
			const accessToken = await getConnectedYouTubeAccessToken({
				userId: context.job.requestedByUserId,
				organizationId: context.job.organizationId
			});
			const refreshedVideo = await getYouTubeVideoData(context.video.youtubeVideoId, accessToken);

			await ctx.runMutation(internal.videoCommands.recordYoutubeSnapshotInternal, {
				organizationId: context.job.organizationId,
				videoId: context.video._id,
				youtubeVideoId: refreshedVideo.youtubeVideoId,
				...(refreshedVideo.channelId !== undefined
					? { youtubeChannelId: refreshedVideo.channelId }
					: {}),
				title: refreshedVideo.title,
				...(refreshedVideo.description !== undefined
					? { description: refreshedVideo.description }
					: {}),
				videoUrl: refreshedVideo.videoUrl,
				studioEditUrl: refreshedVideo.studioEditUrl,
				...(refreshedVideo.thumbnailUrl !== undefined
					? { thumbnailUrl: refreshedVideo.thumbnailUrl }
					: {}),
				...(refreshedVideo.channelTitle !== undefined
					? { channelTitle: refreshedVideo.channelTitle }
					: {}),
				...(refreshedVideo.publishedAt !== undefined
					? { publishedAt: refreshedVideo.publishedAt }
					: {}),
				...(refreshedVideo.videoPublishedAt !== undefined
					? { videoPublishedAt: refreshedVideo.videoPublishedAt }
					: {})
			});

			await ctx.runMutation(internal.workflowJobCommands.recordCompleteInternal, {
				jobId,
				result: JSON.stringify({ youtubeVideoId: refreshedVideo.youtubeVideoId })
			});

			return { video: refreshedVideo, error: null };
		} catch (error) {
			return { video: null, error: await recordWorkflowError(ctx, jobId, error) };
		}
	}
});

export const fetchCaptionsForJob = internalAction({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (
		ctx,
		{ jobId }
	): Promise<{
		caption: unknown;
		error: string | null;
	}> => {
		const context = await ctx.runQuery(
			internal.youtubeWorkflowViews.getCaptionFetchContextInternal,
			{ jobId }
		);

		if (!context.job || !context.video) {
			await recordContextError(ctx, jobId, context.error);
			return { caption: null, error: context.error };
		}

		await ctx.runMutation(internal.workflowJobCommands.recordRunningInternal, { jobId });

		try {
			const accessToken = await getConnectedYouTubeAccessToken(
				{
					userId: context.job.requestedByUserId,
					organizationId: context.job.organizationId
				},
				{ requireWrite: true }
			);
			const tracks = await listYouTubeCaptionTracks(context.video.youtubeVideoId, accessToken);
			const track = bestCaptionTrack(tracks);

			if (!track) {
				throw new Error('No caption tracks were found for this video.');
			}

			const body = await downloadYouTubeCaptionTrack(track.id, accessToken, 'srt');
			const caption = await ctx.runMutation(
				internal.videoCaptions.upsertByVideoIdAndCaptionTrackIdInternal,
				{
					videoId: context.video._id,
					caption: {
						captionTrackId: track.id,
						...(track.language !== undefined ? { language: track.language } : {}),
						...(track.name !== undefined ? { name: track.name } : {}),
						...(track.trackKind !== undefined ? { trackKind: track.trackKind } : {}),
						...(track.isAutoSynced !== undefined ? { isAutoSynced: track.isAutoSynced } : {}),
						...(track.status !== undefined ? { status: track.status } : {}),
						format: 'srt',
						body
					}
				}
			);

			await ctx.runMutation(internal.workflowJobCommands.recordCompleteInternal, {
				jobId,
				result: JSON.stringify({
					captionTrackId: track.id,
					language: track.language ?? null
				})
			});

			return { caption, error: null };
		} catch (error) {
			return { caption: null, error: await recordWorkflowError(ctx, jobId, error) };
		}
	}
});

export const pushTitleForJob = internalAction({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (ctx, { jobId }): Promise<{ title: string | null; error: string | null }> => {
		const context = await ctx.runQuery(
			internal.youtubeWorkflowViews.getTitleUpdateContextInternal,
			{ jobId }
		);

		if (!context.job || !context.video || !context.title) {
			await recordContextError(ctx, jobId, context.error);
			return { title: null, error: context.error };
		}

		await ctx.runMutation(internal.workflowJobCommands.recordRunningInternal, { jobId });

		try {
			const accessToken = await getConnectedYouTubeAccessToken(
				{
					userId: context.job.requestedByUserId,
					organizationId: context.job.organizationId
				},
				{ requireWrite: true }
			);
			const updatedVideo = await updateYouTubeVideoTitle(
				context.video.youtubeVideoId,
				context.title,
				accessToken
			);

			await ctx.runMutation(internal.videoCommands.recordTitleInternal, {
				organizationId: context.job.organizationId,
				videoId: context.video._id,
				title: updatedVideo.title
			});
			await ctx.runMutation(internal.workflowJobCommands.recordCompleteInternal, {
				jobId,
				result: JSON.stringify({ title: updatedVideo.title })
			});

			return { title: updatedVideo.title, error: null };
		} catch (error) {
			return { title: null, error: await recordWorkflowError(ctx, jobId, error) };
		}
	}
});

export const syncAuthorizedChannelsForJob = internalAction({
	args: {
		jobId: v.id('workflowJobs')
	},
	handler: async (
		ctx,
		{ jobId }
	): Promise<{ channels: AuthorizedYouTubeChannel[]; error: string | null }> => {
		const context = await ctx.runQuery(
			internal.youtubeWorkflowViews.getChannelSyncContextInternal,
			{ jobId }
		);

		if (!context.job) {
			await recordContextError(ctx, jobId, context.error);
			return { channels: [], error: context.error };
		}

		await ctx.runMutation(internal.workflowJobCommands.recordRunningInternal, { jobId });

		try {
			const accessToken = await getConnectedYouTubeAccessToken({
				userId: context.job.requestedByUserId,
				organizationId: context.job.organizationId
			});
			const channels = await listAuthorizedYouTubeChannels(accessToken);

			await ctx.runMutation(internal.youtubeChannelCommands.recordAuthorizedChannelsInternal, {
				organizationId: context.job.organizationId,
				channels: channels.map((channel) => ({
					youtubeChannelId: channel.id,
					title: channel.title,
					...(channel.customUrl !== undefined ? { handle: channel.customUrl } : {}),
					...(channel.thumbnailUrl !== undefined ? { thumbnailUrl: channel.thumbnailUrl } : {}),
					...(channel.uploadsPlaylistId !== undefined
						? { uploadsPlaylistId: channel.uploadsPlaylistId }
						: {})
				}))
			});
			await ctx.runMutation(internal.workflowJobCommands.recordCompleteInternal, {
				jobId,
				result: JSON.stringify({ channelCount: channels.length })
			});

			return { channels, error: null };
		} catch (error) {
			return { channels: [], error: await recordWorkflowError(ctx, jobId, error) };
		}
	}
});

function captionTrackScore(track: YouTubeCaptionTrack) {
	const language = track.language?.toLowerCase() ?? '';
	const trackKind = track.trackKind?.toLowerCase() ?? '';

	return (
		(language === 'en' ? 100 : language.startsWith('en-') ? 90 : 0) +
		(trackKind === 'standard' ? 50 : 0) +
		(track.isAutoSynced ? 0 : 10) +
		(track.status === 'serving' ? 5 : 0)
	);
}

function bestCaptionTrack(tracks: YouTubeCaptionTrack[]) {
	return [...tracks].sort((a, b) => captionTrackScore(b) - captionTrackScore(a))[0];
}

async function recordContextError(ctx: ActionCtx, jobId: Id<'workflowJobs'>, error: string | null) {
	await ctx.runMutation(internal.workflowJobCommands.recordErrorInternal, {
		jobId,
		error: error ?? 'Workflow context is unavailable.'
	});
}

async function recordWorkflowError(
	ctx: ActionCtx,
	jobId: Id<'workflowJobs'>,
	error: unknown
): Promise<string> {
	const message =
		error instanceof YouTubeDataApiError || error instanceof WorkOSPipesProviderError
			? error.message
			: error instanceof Error
				? error.message
				: 'YouTube workflow failed.';

	await ctx.runMutation(internal.workflowJobCommands.recordErrorInternal, {
		jobId,
		error: message
	});

	return message;
}
