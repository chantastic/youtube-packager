import { v, type Infer } from 'convex/values';

export const youtubePlaylistSyncTask = 'youtubePlaylistSync';
export const youtubeVideoRefreshTask = 'youtubeVideoRefresh';
export const youtubeCaptionFetchTask = 'youtubeCaptionFetch';
export const youtubeTitleUpdateTask = 'youtubeTitleUpdate';
export const youtubeChannelSyncTask = 'youtubeChannelSync';

export const workflowJobTaskValidator = v.union(
	v.literal(youtubePlaylistSyncTask),
	v.literal(youtubeVideoRefreshTask),
	v.literal(youtubeCaptionFetchTask),
	v.literal(youtubeTitleUpdateTask),
	v.literal(youtubeChannelSyncTask)
);

export const workflowJobStatusValidator = v.union(
	v.literal('queued'),
	v.literal('running'),
	v.literal('complete'),
	v.literal('error')
);

export const workflowJobEntityTypeValidator = v.union(
	v.literal('event'),
	v.literal('video'),
	v.literal('integration')
);

export type WorkflowJobTask = Infer<typeof workflowJobTaskValidator>;
export type WorkflowJobStatus = Infer<typeof workflowJobStatusValidator>;
export type WorkflowJobEntityType = Infer<typeof workflowJobEntityTypeValidator>;
