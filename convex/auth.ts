import { AuthKit } from '@convex-dev/workos-authkit';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

function authKitEnv(name: string) {
	const value = process.env[name];

	if (value) {
		return value;
	}

	if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
		return `test-${name}`;
	}

	return undefined;
}

function webhookSecret() {
	const value = process.env.WORKOS_WEBHOOK_SECRET;

	if (value) {
		return value;
	}

	if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
		return 'test-WORKOS_WEBHOOK_SECRET';
	}

	// Keeps module analysis and non-webhook functions deployable before the WorkOS webhook exists.
	return `missing-WORKOS_WEBHOOK_SECRET-${Math.random().toString(36).slice(2)}`;
}

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
	clientId: authKitEnv('WORKOS_CLIENT_ID'),
	apiKey: authKitEnv('WORKOS_API_KEY'),
	webhookSecret: webhookSecret()
});

export const { backfillUsers } = authKit.utils();
