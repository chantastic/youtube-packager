import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	getWorkOSPipesAccessToken,
	getWorkOSPipesAuthorizationUrl,
	workosPipesProvider
} from './workos-pipes';

const mockPrivateEnv = vi.hoisted(() => ({
	env: {
		WORKOS_API_KEY: 'sk_test_123',
		YOUTUBE_PIPES_PROVIDER: 'google',
		WORKOS_API_BASE_URL: undefined as string | undefined
	}
}));

vi.mock('$env/dynamic/private', () => mockPrivateEnv);

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}

describe('WorkOS Pipes helpers', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		mockPrivateEnv.env.WORKOS_API_KEY = 'sk_test_123';
		mockPrivateEnv.env.YOUTUBE_PIPES_PROVIDER = 'google';
		mockPrivateEnv.env.WORKOS_API_BASE_URL = undefined;
	});

	test('uses google as the default YouTube Pipes provider', () => {
		expect(workosPipesProvider()).toBe('google');
	});

	test('fetches an active access token through WorkOS Pipes', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe('https://api.workos.com/data-integrations/google/token');
				expect(init?.method).toBe('POST');
				expect(init?.headers).toMatchObject({
					Authorization: 'Bearer sk_test_123'
				});
				expect(JSON.parse(String(init?.body))).toEqual({
					user_id: 'user_123',
					organization_id: 'org_123'
				});

				return jsonResponse({
					active: true,
					access_token: {
						object: 'access_token',
						access_token: 'youtube-access-token',
						expires_at: '2026-01-01T00:00:00.000Z',
						scopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
						missing_scopes: []
					}
				});
			})
		);

		await expect(
			getWorkOSPipesAccessToken({
				userId: 'user_123',
				organizationId: 'org_123'
			})
		).resolves.toEqual({
			active: true,
			accessToken: {
				token: 'youtube-access-token',
				expiresAt: '2026-01-01T00:00:00.000Z',
				scopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
				missingScopes: []
			}
		});
	});

	test('returns inactive Pipes token states without exposing a token', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse({
					active: false,
					error: 'needs_reauthorization'
				})
			)
		);

		await expect(
			getWorkOSPipesAccessToken({
				userId: 'user_123'
			})
		).resolves.toEqual({
			active: false,
			error: 'needs_reauthorization'
		});
	});

	test('creates a Pipes authorization URL for the current user and organization', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe('https://api.workos.com/data-integrations/google/authorize');
				expect(init?.method).toBe('POST');
				expect(init?.headers).toMatchObject({
					Authorization: 'Bearer sk_test_123',
					'Content-Type': 'application/json'
				});
				expect(JSON.parse(String(init?.body))).toEqual({
					user_id: 'user_123',
					organization_id: 'org_123',
					return_to: 'http://localhost:5173/integrations'
				});

				return jsonResponse({
					url: 'https://accounts.google.com/o/oauth2/v2/auth'
				});
			})
		);

		await expect(
			getWorkOSPipesAuthorizationUrl(
				{
					userId: 'user_123',
					organizationId: 'org_123'
				},
				{
					returnTo: 'http://localhost:5173/integrations'
				}
			)
		).resolves.toBe('https://accounts.google.com/o/oauth2/v2/auth');
	});
});
