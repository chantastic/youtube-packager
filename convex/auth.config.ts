import type { AuthConfig } from 'convex/server';

const clientId = process.env.WORKOS_CLIENT_ID;

if (!clientId) {
	throw new Error('Set WORKOS_CLIENT_ID in Convex to validate WorkOS AuthKit tokens.');
}

const jwks = `https://api.workos.com/sso/jwks/${clientId}`;

const authConfig = {
	providers: [
		{
			type: 'customJwt',
			issuer: 'https://api.workos.com',
			algorithm: 'RS256',
			jwks,
			applicationID: clientId
		},
		{
			type: 'customJwt',
			issuer: 'https://api.workos.com/',
			algorithm: 'RS256',
			jwks,
			applicationID: clientId
		},
		{
			type: 'customJwt',
			issuer: `https://api.workos.com/user_management/${clientId}`,
			algorithm: 'RS256',
			jwks
		},
		{
			type: 'customJwt',
			issuer: `https://api.workos.com/user_management/${clientId}/`,
			algorithm: 'RS256',
			jwks
		}
	]
} satisfies AuthConfig;

export default authConfig;
