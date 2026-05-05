<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="container mx-auto max-w-2xl p-8">
	<h1 class="mb-6 text-3xl font-bold">Welcome to SvelteKit</h1>

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
				<button
					type="submit"
					class="rounded bg-red-500 px-4 py-2 text-white transition-colors hover:bg-red-600"
				>
					Sign Out
				</button>
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

	<p class="mt-8 text-gray-600">
		Visit <a href="https://svelte.dev/docs/kit" class="text-blue-500 underline">svelte.dev/docs/kit</a> to read the documentation
	</p>
</main>
