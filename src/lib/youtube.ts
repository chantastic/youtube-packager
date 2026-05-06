export function extractYouTubePlaylistId(value?: string) {
	const input = value?.trim();

	if (!input) {
		return undefined;
	}

	try {
		const url = new URL(input);
		const list = url.searchParams.get('list');

		if (list) {
			return list;
		}

		if (url.hostname === 'studio.youtube.com') {
			const [, resource, playlistId] = url.pathname.split('/');

			if (resource === 'playlist' && playlistId) {
				return playlistId;
			}
		}
	} catch {
		// Treat non-URL values as raw playlist IDs.
	}

	return input;
}

export function youtubePlaylistUrl(playlistId: string) {
	return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
}

export function youtubeStudioPlaylistEditUrl(playlistId: string) {
	return `https://studio.youtube.com/playlist/${encodeURIComponent(playlistId)}/edit`;
}

export function youtubeStudioPlaylistContentUrl(playlistId: string) {
	return `https://studio.youtube.com/playlist/${encodeURIComponent(playlistId)}/videos`;
}

export function youtubeVideoUrl(videoId: string, playlistId?: string) {
	const url = new URL('https://www.youtube.com/watch');
	url.searchParams.set('v', videoId);

	if (playlistId) {
		url.searchParams.set('list', playlistId);
	}

	return url.toString();
}

export function youtubeStudioVideoEditUrl(videoId: string) {
	return `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/edit`;
}
