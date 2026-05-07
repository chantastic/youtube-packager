import {
	extractYouTubePlaylistId,
	youtubePlaylistUrl,
	youtubeStudioPlaylistContentUrl,
	youtubeStudioPlaylistEditUrl,
	youtubeStudioVideoEditUrl,
	youtubeVideoUrl
} from '$lib/youtube';

const youtubeApiBaseUrl = 'https://www.googleapis.com/youtube/v3';

type YouTubeThumbnail = {
	url?: string;
	width?: number;
	height?: number;
};

type YouTubeSnippet = {
	title?: string;
	description?: string;
	channelTitle?: string;
	publishedAt?: string;
	thumbnails?: Record<string, YouTubeThumbnail>;
};

type YouTubePlaylistListResponse = {
	items?: Array<{
		id?: string;
		snippet?: YouTubeSnippet;
		contentDetails?: {
			itemCount?: number;
		};
	}>;
};

type YouTubePlaylistItemsResponse = {
	nextPageToken?: string;
	items?: Array<{
		id?: string;
		snippet?: YouTubeSnippet & {
			position?: number;
			videoOwnerChannelTitle?: string;
			resourceId?: {
				videoId?: string;
			};
		};
		contentDetails?: {
			videoId?: string;
			videoPublishedAt?: string;
		};
	}>;
};

type YouTubeCaptionListResponse = {
	items?: Array<{
		id?: string;
		snippet?: {
			videoId?: string;
			lastUpdated?: string;
			trackKind?: string;
			language?: string;
			name?: string;
			audioTrackType?: string;
			isCC?: boolean;
			isLarge?: boolean;
			isEasyReader?: boolean;
			isDraft?: boolean;
			isAutoSynced?: boolean;
			status?: string;
			failureReason?: string;
		};
	}>;
};

type YouTubeVideoListResponse = {
	items?: Array<{
		id?: string;
		snippet?: YouTubeSnippet & {
			title?: string;
			description?: string;
			tags?: string[];
			categoryId?: string;
			defaultLanguage?: string;
		};
	}>;
};

type YouTubeChannelListResponse = {
	items?: Array<{
		id?: string;
		snippet?: {
			title?: string;
			customUrl?: string;
			thumbnails?: Record<string, YouTubeThumbnail>;
		};
		contentDetails?: {
			relatedPlaylists?: {
				uploads?: string;
			};
		};
	}>;
};

export type PublicPlaylistVideo = {
	playlistItemId: string;
	videoId: string;
	title: string;
	description?: string;
	position: number;
	videoUrl: string;
	playlistVideoUrl: string;
	studioEditUrl: string;
	thumbnailUrl?: string;
	channelTitle?: string;
	publishedAt?: string;
	videoPublishedAt?: string;
};

export type PublicVideoData = {
	youtubeVideoId: string;
	title: string;
	description?: string;
	videoUrl: string;
	studioEditUrl: string;
	thumbnailUrl?: string;
	channelTitle?: string;
	publishedAt?: string;
	videoPublishedAt?: string;
};

export type PublicPlaylistData = {
	playlistId: string;
	title?: string;
	description?: string;
	channelTitle?: string;
	itemCount?: number;
	url: string;
	studioEditUrl: string;
	studioContentUrl: string;
	videos: PublicPlaylistVideo[];
};

export type AuthorizedYouTubeChannel = {
	id: string;
	title: string;
	customUrl?: string;
	thumbnailUrl?: string;
	uploadsPlaylistId?: string;
};

export const youtubeCaptionFormats = ['srt', 'vtt', 'sbv', 'scc', 'ttml'] as const;

export type YouTubeCaptionFormat = (typeof youtubeCaptionFormats)[number];

export type YouTubeCaptionTrack = {
	id: string;
	videoId?: string;
	language?: string;
	name?: string;
	trackKind?: string;
	isAutoSynced?: boolean;
	status?: string;
};

export class YouTubeDataApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'YouTubeDataApiError';
		this.status = status;
	}
}

function pickThumbnail(thumbnails?: Record<string, YouTubeThumbnail>) {
	return (
		thumbnails?.maxres?.url ??
		thumbnails?.standard?.url ??
		thumbnails?.high?.url ??
		thumbnails?.medium?.url ??
		thumbnails?.default?.url
	);
}

async function youtubeGet<T>(path: string, params: Record<string, string>, accessToken: string) {
	const url = new URL(`${youtubeApiBaseUrl}${path}`);

	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});
	const body = await response.json().catch(() => ({}));

	if (!response.ok) {
		const message =
			typeof body?.error?.message === 'string'
				? body.error.message
				: `YouTube API request failed with ${response.status}`;
		throw new YouTubeDataApiError(message, response.status);
	}

	return body as T;
}

async function youtubeTextGet(path: string, params: Record<string, string>, accessToken: string) {
	const url = new URL(`${youtubeApiBaseUrl}${path}`);

	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});
	const text = await response.text();

	if (!response.ok) {
		let message = `YouTube API request failed with ${response.status}`;

		try {
			const body = JSON.parse(text) as { error?: { message?: string } };
			message = body.error?.message ?? message;
		} catch {
			if (text.trim()) {
				message = text.trim();
			}
		}

		throw new YouTubeDataApiError(message, response.status);
	}

	return text;
}

async function youtubePut<T>(
	path: string,
	params: Record<string, string>,
	accessToken: string,
	resource: unknown
) {
	const url = new URL(`${youtubeApiBaseUrl}${path}`);

	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(resource)
	});
	const body = await response.json().catch(() => ({}));

	if (!response.ok) {
		const message =
			typeof body?.error?.message === 'string'
				? body.error.message
				: `YouTube API request failed with ${response.status}`;
		throw new YouTubeDataApiError(message, response.status);
	}

	return body as T;
}

async function getPlaylistMetadata(playlistId: string, accessToken: string) {
	const response = await youtubeGet<YouTubePlaylistListResponse>(
		'/playlists',
		{
			part: 'snippet,contentDetails',
			id: playlistId,
			maxResults: '1'
		},
		accessToken
	);

	return response.items?.[0] ?? null;
}

async function getPlaylistVideos(playlistId: string, accessToken: string) {
	const videos: PublicPlaylistVideo[] = [];
	let pageToken: string | undefined;

	do {
		const response = await youtubeGet<YouTubePlaylistItemsResponse>(
			'/playlistItems',
			{
				part: 'snippet,contentDetails',
				playlistId,
				maxResults: '50',
				...(pageToken ? { pageToken } : {})
			},
			accessToken
		);

		for (const item of response.items ?? []) {
			const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;

			if (!item.id || !videoId) {
				continue;
			}

			videos.push({
				playlistItemId: item.id,
				videoId,
				title: item.snippet?.title ?? 'Untitled video',
				description: item.snippet?.description,
				position: item.snippet?.position ?? videos.length,
				videoUrl: youtubeVideoUrl(videoId),
				playlistVideoUrl: youtubeVideoUrl(videoId, playlistId),
				studioEditUrl: youtubeStudioVideoEditUrl(videoId),
				thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
				channelTitle: item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle,
				publishedAt: item.snippet?.publishedAt,
				videoPublishedAt: item.contentDetails?.videoPublishedAt
			});
		}

		pageToken = response.nextPageToken;
	} while (pageToken);

	return videos.sort((a, b) => a.position - b.position);
}

async function getVideoSnippet(videoId: string, accessToken: string) {
	const response = await youtubeGet<YouTubeVideoListResponse>(
		'/videos',
		{
			part: 'snippet',
			id: videoId,
			maxResults: '1'
		},
		accessToken
	);
	const video = response.items?.[0];

	if (!video?.id || !video.snippet) {
		throw new YouTubeDataApiError('No video found for this YouTube connection.', 404);
	}

	const snippet = video.snippet;

	if (!snippet.categoryId) {
		throw new YouTubeDataApiError('YouTube did not return a category for this video.', 400);
	}

	return {
		id: video.id,
		snippet
	};
}

export async function getYouTubeVideoData(
	videoId: string,
	accessToken: string
): Promise<PublicVideoData> {
	const video = await getVideoSnippet(videoId, accessToken);
	const publishedAt = video.snippet.publishedAt;

	return {
		youtubeVideoId: video.id,
		title: video.snippet.title ?? 'Untitled video',
		description: video.snippet.description ?? '',
		videoUrl: youtubeVideoUrl(video.id),
		studioEditUrl: youtubeStudioVideoEditUrl(video.id),
		thumbnailUrl: pickThumbnail(video.snippet.thumbnails),
		channelTitle: video.snippet.channelTitle,
		publishedAt,
		videoPublishedAt: publishedAt
	};
}

export async function updateYouTubeVideoTitle(videoId: string, title: string, accessToken: string) {
	const trimmedTitle = title.trim();

	if (!trimmedTitle) {
		throw new YouTubeDataApiError('Choose a non-empty title before updating YouTube.', 400);
	}

	if (trimmedTitle.length > 100) {
		throw new YouTubeDataApiError('YouTube video titles must be 100 characters or fewer.', 400);
	}

	if (/[<>]/.test(trimmedTitle)) {
		throw new YouTubeDataApiError('YouTube video titles cannot contain < or >.', 400);
	}

	const video = await getVideoSnippet(videoId, accessToken);
	const snippet = {
		title: trimmedTitle,
		categoryId: video.snippet.categoryId,
		description: video.snippet.description ?? '',
		...(video.snippet.tags ? { tags: video.snippet.tags } : {}),
		...(video.snippet.defaultLanguage ? { defaultLanguage: video.snippet.defaultLanguage } : {})
	};
	const updatedVideo = await youtubePut<{
		id?: string;
		snippet?: {
			title?: string;
		};
	}>(
		'/videos',
		{
			part: 'snippet'
		},
		accessToken,
		{
			id: video.id,
			snippet
		}
	);

	return {
		videoId: updatedVideo.id ?? video.id,
		title: updatedVideo.snippet?.title ?? trimmedTitle
	};
}

export async function listYouTubeCaptionTracks(videoId: string, accessToken: string) {
	const response = await youtubeGet<YouTubeCaptionListResponse>(
		'/captions',
		{
			part: 'id,snippet',
			videoId
		},
		accessToken
	);

	return (response.items ?? [])
		.filter((item) => typeof item.id === 'string')
		.map(
			(item): YouTubeCaptionTrack => ({
				id: item.id as string,
				...(item.snippet?.videoId ? { videoId: item.snippet.videoId } : {}),
				...(item.snippet?.language ? { language: item.snippet.language } : {}),
				...(item.snippet?.name ? { name: item.snippet.name } : {}),
				...(item.snippet?.trackKind ? { trackKind: item.snippet.trackKind } : {}),
				...(item.snippet?.isAutoSynced !== undefined
					? { isAutoSynced: item.snippet.isAutoSynced }
					: {}),
				...(item.snippet?.status ? { status: item.snippet.status } : {})
			})
		);
}

export async function downloadYouTubeCaptionTrack(
	captionTrackId: string,
	accessToken: string,
	format: YouTubeCaptionFormat = 'srt'
) {
	return await youtubeTextGet(
		`/captions/${encodeURIComponent(captionTrackId)}`,
		{
			tfmt: format
		},
		accessToken
	);
}

export async function listAuthorizedYouTubeChannels(accessToken: string) {
	const response = await youtubeGet<YouTubeChannelListResponse>(
		'/channels',
		{
			part: 'snippet,contentDetails',
			mine: 'true'
		},
		accessToken
	);

	return (response.items ?? [])
		.filter((channel) => typeof channel.id === 'string')
		.map((channel): AuthorizedYouTubeChannel => {
			const thumbnailUrl = pickThumbnail(channel.snippet?.thumbnails);

			return {
				id: channel.id as string,
				title: channel.snippet?.title ?? 'Untitled channel',
				...(channel.snippet?.customUrl ? { customUrl: channel.snippet.customUrl } : {}),
				...(thumbnailUrl ? { thumbnailUrl } : {}),
				...(channel.contentDetails?.relatedPlaylists?.uploads
					? { uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads }
					: {})
			};
		});
}

export async function getYouTubePlaylistData(
	input: string,
	accessToken: string
): Promise<PublicPlaylistData> {
	const playlistId = extractYouTubePlaylistId(input);

	if (!playlistId) {
		throw new YouTubeDataApiError('Enter a YouTube playlist URL or playlist ID.', 400);
	}

	const [playlist, videos] = await Promise.all([
		getPlaylistMetadata(playlistId, accessToken),
		getPlaylistVideos(playlistId, accessToken)
	]);

	if (!playlist) {
		throw new YouTubeDataApiError(
			'No playlist found for that ID with this YouTube connection.',
			404
		);
	}

	return {
		playlistId,
		title: playlist.snippet?.title,
		description: playlist.snippet?.description,
		channelTitle: playlist.snippet?.channelTitle,
		itemCount: playlist.contentDetails?.itemCount,
		url: youtubePlaylistUrl(playlistId),
		studioEditUrl: youtubeStudioPlaylistEditUrl(playlistId),
		studioContentUrl: youtubeStudioPlaylistContentUrl(playlistId),
		videos
	};
}
