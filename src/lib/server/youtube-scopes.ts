export const youtubeReadonlyScope = 'https://www.googleapis.com/auth/youtube.readonly';
export const youtubeWriteScope = 'https://www.googleapis.com/auth/youtube.force-ssl';

export function hasReadonlyScope(scopes: string[]) {
	return scopes.includes(youtubeReadonlyScope) || hasWriteScope(scopes);
}

export function hasWriteScope(scopes: string[]) {
	return scopes.includes(youtubeWriteScope);
}
