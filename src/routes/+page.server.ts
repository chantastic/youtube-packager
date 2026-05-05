import { authKit } from '@workos/authkit-sveltekit';
import type { Actions } from './$types';

export const actions: Actions = {
	signout: async (event) => {
		return authKit.signOut(event);
	}
};
