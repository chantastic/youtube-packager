import { describe, expect, test } from 'vitest';
import {
	hasReadonlyScope,
	hasWriteScope,
	parseGoogleTokenResponse,
	scopesForMode,
	youtubeReadonlyScope,
	youtubeWriteScope
} from './youtube-oauth';

describe('YouTube OAuth helpers', () => {
	test('uses read-only scope by default and write scope for metadata writes', () => {
		expect(scopesForMode('readonly')).toEqual([youtubeReadonlyScope]);
		expect(scopesForMode('write')).toEqual([youtubeWriteScope]);
	});

	test('treats write scope as sufficient read access', () => {
		expect(hasReadonlyScope([youtubeReadonlyScope])).toBe(true);
		expect(hasReadonlyScope([youtubeWriteScope])).toBe(true);
		expect(hasWriteScope([youtubeReadonlyScope])).toBe(false);
		expect(hasWriteScope([youtubeWriteScope])).toBe(true);
	});

	test('parses Google token responses without leaking extra fields', () => {
		expect(
			parseGoogleTokenResponse({
				access_token: 'access-token',
				refresh_token: 'refresh-token',
				expires_in: 3600,
				token_type: 'Bearer',
				scope: `${youtubeReadonlyScope} ${youtubeWriteScope}`
			})
		).toEqual({
			accessToken: 'access-token',
			refreshToken: 'refresh-token',
			expiresIn: 3600,
			tokenType: 'Bearer',
			scopes: [youtubeReadonlyScope, youtubeWriteScope]
		});
	});
});
