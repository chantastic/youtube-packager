import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	downloadYouTubeCaptionTrack,
	getYouTubePlaylistData,
	listAuthorizedYouTubeChannels,
	listYouTubeCaptionTracks,
	updateYouTubeVideoTitle
} from './youtube-data-api';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}

function textResponse(body: string, status = 200) {
	return new Response(body, {
		status,
		headers: {
			'Content-Type': 'text/plain'
		}
	});
}

describe('YouTube Data API helpers', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('updates a video title while preserving mutable snippet fields', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(
				jsonResponse({
					items: [
						{
							id: 'video-1',
							snippet: {
								title: 'Old title',
								description: 'Existing description',
								categoryId: '28',
								tags: ['auth', 'youtube'],
								defaultLanguage: 'en'
							}
						}
					]
				})
			)
			.mockResolvedValueOnce(
				jsonResponse({
					id: 'video-1',
					snippet: {
						title: 'New title'
					}
				})
			);

		const updatedVideo = await updateYouTubeVideoTitle('video-1', 'New title', 'access-token');
		const updateRequest = fetchMock.mock.calls[1][1] as RequestInit;

		expect(updatedVideo).toEqual({
			videoId: 'video-1',
			title: 'New title'
		});
		expect(updateRequest.method).toBe('PUT');
		expect(updateRequest.body ? JSON.parse(updateRequest.body as string) : null).toEqual({
			id: 'video-1',
			snippet: {
				title: 'New title',
				categoryId: '28',
				description: 'Existing description',
				tags: ['auth', 'youtube'],
				defaultLanguage: 'en'
			}
		});
	});

	test('rejects titles over the YouTube title length limit before calling YouTube', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch');

		await expect(
			updateYouTubeVideoTitle('video-1', 'x'.repeat(101), 'access-token')
		).rejects.toThrow('100 characters or fewer');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('lists caption tracks while omitting malformed caption resources', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			jsonResponse({
				items: [
					{
						id: 'caption-1',
						snippet: {
							videoId: 'video-1',
							language: 'en',
							name: 'English',
							trackKind: 'standard',
							isAutoSynced: false,
							status: 'serving'
						}
					},
					{
						snippet: {
							videoId: 'video-1',
							language: 'es'
						}
					}
				]
			})
		);

		await expect(listYouTubeCaptionTracks('video-1', 'access-token')).resolves.toEqual([
			{
				id: 'caption-1',
				videoId: 'video-1',
				language: 'en',
				name: 'English',
				trackKind: 'standard',
				isAutoSynced: false,
				status: 'serving'
			}
		]);
	});

	test('downloads captions in the requested format', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(textResponse('1\n00:00:00,000 --> 00:00:01,000\nHello'));

		await expect(
			downloadYouTubeCaptionTrack('caption/with slash', 'access-token', 'srt')
		).resolves.toBe('1\n00:00:00,000 --> 00:00:01,000\nHello');

		const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);

		expect(requestUrl.pathname).toBe('/youtube/v3/captions/caption%2Fwith%20slash');
		expect(requestUrl.searchParams.get('tfmt')).toBe('srt');
	});

	test('lists channels authorized through the current YouTube access token', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			jsonResponse({
				items: [
					{
						id: 'channel-1',
						snippet: {
							title: 'WorkOS',
							customUrl: '@workos',
							thumbnails: {
								default: {
									url: 'https://yt.example/channel.jpg'
								}
							}
						},
						contentDetails: {
							relatedPlaylists: {
								uploads: 'uploads-playlist'
							}
						}
					},
					{
						snippet: {
							title: 'Malformed channel'
						}
					}
				]
			})
		);

		await expect(listAuthorizedYouTubeChannels('access-token')).resolves.toEqual([
			{
				id: 'channel-1',
				title: 'WorkOS',
				customUrl: '@workos',
				thumbnailUrl: 'https://yt.example/channel.jpg',
				uploadsPlaylistId: 'uploads-playlist'
			}
		]);

		const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);

		expect(requestUrl.pathname).toBe('/youtube/v3/channels');
		expect(requestUrl.searchParams.get('mine')).toBe('true');
	});

	test('surfaces caption authorization errors from YouTube text responses', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			textResponse(
				JSON.stringify({
					error: {
						message: 'The permissions associated with the request are not sufficient.'
					}
				}),
				403
			)
		);

		await expect(downloadYouTubeCaptionTrack('caption-1', 'access-token', 'srt')).rejects.toThrow(
			'permissions associated with the request are not sufficient'
		);
	});

	test('collects playlist metadata and paginated playlist items', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(
				jsonResponse({
					items: [
						{
							id: 'PL123',
							snippet: {
								title: 'Playlist title',
								description: 'Playlist description',
								channelTitle: 'Brand Channel'
							},
							contentDetails: {
								itemCount: 2
							}
						}
					]
				})
			)
			.mockResolvedValueOnce(
				jsonResponse({
					nextPageToken: 'next-page',
					items: [
						{
							id: 'playlist-item-2',
							snippet: {
								title: 'Second video',
								description: 'Second description',
								position: 1,
								videoOwnerChannelTitle: 'Brand Channel',
								resourceId: {
									videoId: 'video-2'
								},
								thumbnails: {
									high: {
										url: 'https://img.youtube.com/vi/video-2/hqdefault.jpg'
									}
								}
							},
							contentDetails: {
								videoId: 'video-2',
								videoPublishedAt: '2026-01-02T00:00:00Z'
							}
						}
					]
				})
			)
			.mockResolvedValueOnce(
				jsonResponse({
					items: [
						{
							id: 'playlist-item-1',
							snippet: {
								title: 'First video',
								position: 0,
								resourceId: {
									videoId: 'video-1'
								}
							},
							contentDetails: {
								videoId: 'video-1',
								videoPublishedAt: '2026-01-01T00:00:00Z'
							}
						}
					]
				})
			);

		const playlist = await getYouTubePlaylistData(
			'https://www.youtube.com/playlist?list=PL123',
			'access-token'
		);
		const secondPlaylistItemsUrl = new URL(fetchMock.mock.calls[2][0] as string);

		expect(secondPlaylistItemsUrl.searchParams.get('pageToken')).toBe('next-page');
		expect(playlist).toMatchObject({
			playlistId: 'PL123',
			title: 'Playlist title',
			description: 'Playlist description',
			channelTitle: 'Brand Channel',
			itemCount: 2,
			url: 'https://www.youtube.com/playlist?list=PL123'
		});
		expect(playlist.videos.map((video) => video.videoId)).toEqual(['video-1', 'video-2']);
		expect(playlist.videos[1]).toMatchObject({
			playlistItemId: 'playlist-item-2',
			videoId: 'video-2',
			title: 'Second video',
			thumbnailUrl: 'https://img.youtube.com/vi/video-2/hqdefault.jpg',
			channelTitle: 'Brand Channel'
		});
	});

	test('surfaces private or unauthorized playlist access errors', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			jsonResponse(
				{
					error: {
						message: 'The playlist identified with the request cannot be found.'
					}
				},
				404
			)
		);

		await expect(getYouTubePlaylistData('PL_PRIVATE', 'access-token')).rejects.toThrow(
			'cannot be found'
		);
	});
});
