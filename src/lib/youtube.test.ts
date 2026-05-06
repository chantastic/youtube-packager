import { describe, expect, test } from 'vitest';
import {
	extractYouTubePlaylistId,
	youtubePlaylistUrl,
	youtubeStudioPlaylistContentUrl,
	youtubeStudioPlaylistEditUrl
} from './youtube';

const playlistId = 'PLB4m9iWZsJzjWu-jHabbudMHzp9Cl489R';

describe('YouTube playlist helpers', () => {
	test('extracts IDs from raw playlist IDs', () => {
		expect(extractYouTubePlaylistId(playlistId)).toBe(playlistId);
	});

	test('extracts IDs from public playlist URLs', () => {
		expect(extractYouTubePlaylistId(`https://www.youtube.com/playlist?list=${playlistId}`)).toBe(
			playlistId
		);
	});

	test('extracts IDs from Studio playlist edit URLs', () => {
		expect(extractYouTubePlaylistId(`https://studio.youtube.com/playlist/${playlistId}/edit`)).toBe(
			playlistId
		);
	});

	test('extracts IDs from Studio playlist content URLs', () => {
		expect(
			extractYouTubePlaylistId(`https://studio.youtube.com/playlist/${playlistId}/videos`)
		).toBe(playlistId);
	});

	test('builds public and Studio playlist URLs', () => {
		expect(youtubePlaylistUrl(playlistId)).toBe(
			`https://www.youtube.com/playlist?list=${playlistId}`
		);
		expect(youtubeStudioPlaylistEditUrl(playlistId)).toBe(
			`https://studio.youtube.com/playlist/${playlistId}/edit`
		);
		expect(youtubeStudioPlaylistContentUrl(playlistId)).toBe(
			`https://studio.youtube.com/playlist/${playlistId}/videos`
		);
	});
});
