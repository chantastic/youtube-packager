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
