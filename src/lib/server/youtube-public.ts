import { env } from '$env/dynamic/private';
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

export class YouTubePublicApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'YouTubePublicApiError';
		this.status = status;
	}
}

function getYouTubeApiKey() {
	return env.YOUTUBE_API_KEY || env.PUBLIC_YOUTUBE_API_KEY;
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

async function youtubeGet<T>(path: string, params: Record<string, string>) {
	const apiKey = getYouTubeApiKey();

	if (!apiKey) {
		throw new YouTubePublicApiError(
			'Set YOUTUBE_API_KEY to fetch public YouTube playlist data.',
			500
		);
	}

	const url = new URL(`${youtubeApiBaseUrl}${path}`);
	url.searchParams.set('key', apiKey);

	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const response = await fetch(url);
	const body = await response.json().catch(() => ({}));

	if (!response.ok) {
		const message =
			typeof body?.error?.message === 'string'
				? body.error.message
				: `YouTube API request failed with ${response.status}`;
		throw new YouTubePublicApiError(message, response.status);
	}

	return body as T;
}

async function getPlaylistMetadata(playlistId: string) {
	const response = await youtubeGet<YouTubePlaylistListResponse>('/playlists', {
		part: 'snippet,contentDetails',
		id: playlistId,
		maxResults: '1'
	});

	return response.items?.[0] ?? null;
}

async function getPlaylistVideos(playlistId: string) {
	const videos: PublicPlaylistVideo[] = [];
	let pageToken: string | undefined;

	do {
		const response = await youtubeGet<YouTubePlaylistItemsResponse>('/playlistItems', {
			part: 'snippet,contentDetails',
			playlistId,
			maxResults: '50',
			...(pageToken ? { pageToken } : {})
		});

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

export async function getPublicPlaylistData(input: string): Promise<PublicPlaylistData> {
	const playlistId = extractYouTubePlaylistId(input);

	if (!playlistId) {
		throw new YouTubePublicApiError('Enter a YouTube playlist URL or playlist ID.', 400);
	}

	const [playlist, videos] = await Promise.all([
		getPlaylistMetadata(playlistId),
		getPlaylistVideos(playlistId)
	]);

	if (!playlist) {
		throw new YouTubePublicApiError('No public playlist found for that ID.', 404);
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
