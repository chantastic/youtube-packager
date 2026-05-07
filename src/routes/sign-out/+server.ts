import { authKit } from '@workos/authkit-sveltekit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	return await authKit.signOut(event);
};

export const POST = GET;
