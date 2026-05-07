<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="container mx-auto max-w-2xl p-8">
	<h1 class="mb-6 text-3xl font-bold">YouTube Packager</h1>

	{#if data.auth?.user}
		<div class="rounded-lg border border-green-200 bg-green-50 p-6">
			<p class="mb-4 text-lg">
				Hello, <strong>{data.auth.user.firstName ?? data.auth.user.email}</strong>!
			</p>
			<div class="mb-4 rounded bg-gray-100 p-4">
				<p class="text-sm text-gray-600">User ID: {data.auth.user.id}</p>
				<p class="text-sm text-gray-600">Email: {data.auth.user.email}</p>
				{#if data.auth.organizationId}
					<p class="text-sm text-gray-600">Organization: {data.auth.organizationId}</p>
				{/if}
			</div>
			<form method="POST" action="?/signout">
				<div class="flex flex-wrap gap-2">
					<a
						href="/integrations"
						class="rounded bg-gray-950 px-4 py-2 text-white transition-colors hover:bg-gray-800"
					>
						Integrations
					</a>
					<a
						href="/events"
						class="rounded border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-white"
					>
						Events
					</a>
					<button
						type="submit"
						class="rounded border border-red-200 px-4 py-2 text-red-700 transition-colors hover:bg-red-50"
					>
						Sign Out
					</button>
				</div>
			</form>
		</div>
	{:else}
		<div class="rounded-lg border border-blue-200 bg-blue-50 p-6">
			<p class="mb-4 text-gray-700">You are not signed in.</p>
			<a
				href="/sign-in"
				class="inline-block rounded bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
			>
				Sign In with WorkOS
			</a>
		</div>
	{/if}

	<p class="mt-8 text-gray-600">Package YouTube playlists and video metadata from one place.</p>
</main>
