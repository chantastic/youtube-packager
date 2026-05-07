import { query } from './_generated/server';
import { authKit } from './auth';

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return await authKit.getAuthUser(ctx);
	}
});
