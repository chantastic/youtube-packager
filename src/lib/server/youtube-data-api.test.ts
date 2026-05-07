import { afterEach, describe, expect, test, vi } from 'vitest';
import { updateYouTubeVideoTitle } from './youtube-data-api';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json'
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
});
