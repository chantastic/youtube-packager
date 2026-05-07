<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const activePipesConnection = $derived(
		data.pipesConnection?.active === true ? data.pipesConnection : null
	);
	const directConnectedAt = $derived(
		data.directConnection ? new Date(data.directConnection.connectedAt).toLocaleString() : null
	);
	const testResult = $derived(form && 'testResult' in form ? form.testResult : null);

	function pipesStatusTone() {
		if (data.pipesConfigError || data.pipesError)
			return 'border-amber-200 bg-amber-50 text-amber-800';
		if (!data.pipesConnection) return 'border-amber-200 bg-amber-50 text-amber-800';
		if (!data.pipesConnection.active) return 'border-amber-200 bg-amber-50 text-amber-800';
		if (data.hasPipesWriteAccess) return 'border-green-200 bg-green-50 text-green-700';
		if (data.hasPipesReadonlyAccess) return 'border-blue-200 bg-blue-50 text-blue-700';

		return 'border-amber-200 bg-amber-50 text-amber-800';
	}

	function pipesStatusLabel() {
		if (data.pipesConfigError) return 'Configuration issue';
		if (data.pipesError) return 'Pipes check failed';
		if (!data.pipesConnection) return 'Not connected';
		if (!data.pipesConnection.active) {
			return data.pipesConnection.error === 'needs_reauthorization'
				? 'Reconnect required'
				: 'Not connected';
		}
		if (data.hasPipesWriteAccess) return 'Write access ready';
		if (data.hasPipesReadonlyAccess) return 'Read access ready';

		return 'Missing YouTube scope';
	}

	function inactivePipesMessage() {
		if (!data.pipesConnection || data.pipesConnection.active) return null;

		return data.pipesConnection.error === 'needs_reauthorization'
			? 'WorkOS says this connection needs reauthorization.'
			: 'WorkOS says this provider is not installed for this user.';
	}

	function directStatusLabel() {
		if (data.directConfigError) return 'Configuration issue';
		if (!data.directConnection) return 'Not connected';
		if (data.directConnection.status === 'needs_reauthorization') return 'Reconnect required';
		if (data.hasDirectWriteAccess) return 'Write access enabled';
		if (data.hasDirectReadonlyAccess) return 'Read-only connected';

		return 'Missing YouTube scope';
	}
</script>

<svelte:head>
	<title>Integrations</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<div>
			<a href={resolve('/events')} class="text-sm text-blue-600 hover:underline">Events</a>
			<h1 class="mt-2 text-3xl font-bold tracking-normal text-gray-950">Integrations</h1>
		</div>
	</div>

	<section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3"
		>
			<div>
				<h2 class="text-sm font-semibold text-gray-950">YouTube</h2>
				<p class="mt-1 text-xs text-gray-500">WorkOS Pipes provider: {data.pipesProvider}</p>
			</div>
			<span class={`rounded border px-2 py-1 text-xs ${pipesStatusTone()}`}>
				{pipesStatusLabel()}
			</span>
		</div>

		{#if form?.error}
			<p class="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
				{form.error}
			</p>
		{/if}

		<div class="grid gap-0 md:grid-cols-[minmax(0,1fr)_280px]">
			<div class="px-4 py-4">
				{#if data.pipesConfigError}
					<p class="text-sm text-amber-700">{data.pipesConfigError}</p>
				{:else if data.pipesError}
					<p class="text-sm text-amber-700">{data.pipesError}</p>
				{:else}
					<dl class="grid gap-3 text-sm sm:grid-cols-2">
						<div>
							<dt class="text-gray-500">Connection</dt>
							<dd class="mt-1 text-gray-950">{pipesStatusLabel()}</dd>
						</div>
						<div>
							<dt class="text-gray-500">Token source</dt>
							<dd class="mt-1 text-gray-950">{data.tokenSource}</dd>
						</div>
						<div>
							<dt class="text-gray-500">Read-only scope</dt>
							<dd class="mt-1 font-mono text-xs break-all text-gray-950">
								{data.readonlyScope}
							</dd>
						</div>
						<div>
							<dt class="text-gray-500">Metadata write scope</dt>
							<dd class="mt-1 font-mono text-xs break-all text-gray-950">
								{data.writeScope}
							</dd>
						</div>
					</dl>

					{#if activePipesConnection}
						<div class="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
							<p class="text-xs font-medium text-gray-500 uppercase">Granted scopes</p>
							{#if activePipesConnection.accessToken.scopes.length}
								<ul class="mt-2 space-y-1">
									{#each activePipesConnection.accessToken.scopes as scope (scope)}
										<li class="font-mono text-xs break-all text-gray-700">{scope}</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-2 text-sm text-gray-500">WorkOS did not return scope details.</p>
							{/if}

							{#if activePipesConnection.accessToken.missingScopes.length}
								<p class="mt-3 text-xs font-medium text-amber-700 uppercase">Missing scopes</p>
								<ul class="mt-2 space-y-1">
									{#each activePipesConnection.accessToken.missingScopes as scope (scope)}
										<li class="font-mono text-xs break-all text-amber-700">{scope}</li>
									{/each}
								</ul>
							{/if}

							<p class="mt-3 text-xs text-gray-500">
								Expires:
								{activePipesConnection.accessToken.expiresAt
									? new Date(activePipesConnection.accessToken.expiresAt).toLocaleString()
									: 'Unknown'}
							</p>
						</div>
					{:else}
						<p class="mt-4 text-sm text-gray-600">
							{inactivePipesMessage() ??
								'Connect YouTube through WorkOS Pipes before using the YouTube API.'}
						</p>
					{/if}

					{#if testResult}
						<div class="mt-4 rounded border border-green-200 bg-green-50 p-3">
							<p class="text-sm font-medium text-green-800">YouTube read test succeeded</p>
							<p class="mt-1 text-xs text-green-700">
								Checked {new Date(testResult.checkedAt).toLocaleString()} via {testResult.source}
							</p>

							{#if testResult.channels.length}
								<ul class="mt-3 space-y-2">
									{#each testResult.channels as channel (channel.id)}
										<li class="flex gap-3 rounded border border-green-100 bg-white p-2">
											{#if channel.thumbnailUrl}
												<img
													src={channel.thumbnailUrl}
													alt=""
													class="h-10 w-10 rounded bg-gray-100 object-cover"
												/>
											{/if}
											<div class="min-w-0">
												<p class="truncate text-sm font-medium text-gray-950">{channel.title}</p>
												<p class="font-mono text-xs break-all text-gray-500">{channel.id}</p>
												{#if channel.customUrl}
													<p class="text-xs text-gray-500">{channel.customUrl}</p>
												{/if}
											</div>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-2 text-sm text-green-700">
									WorkOS returned a token, but YouTube did not return a channel for this account.
								</p>
							{/if}
						</div>
					{/if}

					<details class="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
						<summary class="cursor-pointer text-sm font-medium text-gray-700">
							Legacy direct OAuth fallback
						</summary>
						<dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
							<div>
								<dt class="text-gray-500">Status</dt>
								<dd class="mt-1 text-gray-950">{directStatusLabel()}</dd>
							</div>
							<div>
								<dt class="text-gray-500">Connected</dt>
								<dd class="mt-1 text-gray-950">{directConnectedAt ?? 'Not connected'}</dd>
							</div>
						</dl>
						{#if data.directConnection?.lastError}
							<p class="mt-3 text-sm text-amber-700">{data.directConnection.lastError}</p>
						{/if}
					</details>
				{/if}
			</div>

			<div class="border-t border-gray-100 bg-gray-50 px-4 py-4 md:border-t-0 md:border-l">
				<div class="space-y-3">
					<form method="POST" action="?/connectPipes">
						<button
							type="submit"
							disabled={Boolean(data.pipesConfigError)}
							class="w-full rounded bg-gray-950 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
						>
							{activePipesConnection ? 'Reconnect WorkOS Pipes' : 'Connect WorkOS Pipes'}
						</button>
					</form>

					<form method="POST" action="?/testPipesRead">
						<button
							type="submit"
							disabled={Boolean(data.pipesConfigError || data.pipesError)}
							class="w-full rounded border border-green-200 px-3 py-2 text-sm text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
						>
							Test YouTube Access
						</button>
					</form>

					<a
						href="https://studio.youtube.com/"
						target="_blank"
						rel="noreferrer"
						class="block w-full rounded border border-gray-300 px-3 py-2 text-center text-sm text-gray-700 hover:bg-white"
					>
						YouTube Studio
					</a>
				</div>
			</div>
		</div>
	</section>
</main>
