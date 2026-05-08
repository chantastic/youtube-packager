<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Access Required | YouTube Packager</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 px-6 py-16">
	<section class="mx-auto max-w-xl">
		<a href={resolve('/')} class="text-sm font-medium text-blue-700 hover:text-blue-900">
			YouTube Packager
		</a>

		<div class="mt-8 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
			<p class="text-sm font-medium text-amber-700">Organization access required</p>
			<h1 class="mt-3 text-3xl font-semibold tracking-normal text-gray-950">
				You are signed in, but this account is not assigned to an organization.
			</h1>
			<p class="mt-4 text-base leading-7 text-gray-600">
				Ask an app admin to add <span class="font-medium text-gray-900">{data.user.email}</span>
				to the WorkOS organization, then sign in again.
			</p>

			<div class="mt-6 rounded border border-gray-200 bg-gray-50 p-4">
				<p class="text-sm text-gray-600">Signed in as</p>
				<p class="mt-1 font-medium text-gray-950">{data.user.email}</p>
			</div>

			<form method="POST" action={resolve('/sign-out')} class="mt-8 flex flex-wrap gap-3">
				<button
					type="submit"
					class="rounded bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
				>
					Sign out
				</button>
				<a
					href={resolve('/')}
					class="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>
					Back home
				</a>
			</form>
		</div>
	</section>
</main>
