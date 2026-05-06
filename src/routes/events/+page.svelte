<script lang="ts">
	import { enhance } from '$app/forms';
	import { defaultTitleFormat, previewVideoTitle, titleTokens } from '$lib/title-format';
	import { youtubePlaylistUrl } from '$lib/youtube';
	import { slide } from 'svelte/transition';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let editing = $state<string | null>(null);

	let createFormat = $state(defaultTitleFormat);
	let createName = $state('');
	let createYear = $state(new Date().getFullYear());
	let createPlaylistId = $state('');
	let createInput = $state<HTMLInputElement | null>(null);

	let editFormat = $state('');
	let editName = $state('');
	let editYear = $state(new Date().getFullYear());
	let editPlaylistId = $state('');
	let editInput = $state<HTMLInputElement | null>(null);

	function preview(format: string, name: string, year: number) {
		return previewVideoTitle(format, name, year);
	}

	function insertAtCursor(
		input: HTMLInputElement | null,
		token: string,
		setValue: (v: string) => void
	) {
		if (!input) return;
		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? start;
		const next = input.value.slice(0, start) + token + input.value.slice(end);
		setValue(next);
		requestAnimationFrame(() => {
			input.focus();
			input.setSelectionRange(start + token.length, start + token.length);
		});
	}

	function startEditing(event: {
		_id: string;
		name: string;
		year?: number;
		titleFormat?: string;
		youtubePlaylistId?: string;
	}) {
		editing = event._id;
		editName = event.name;
		editYear = event.year ?? new Date().getFullYear();
		editFormat = event.titleFormat ?? defaultTitleFormat;
		editPlaylistId = event.youtubePlaylistId ?? '';
	}

	function afterUpdate() {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			editing = null;
		};
	}

	function afterCreate() {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			createName = '';
			createYear = new Date().getFullYear();
			createPlaylistId = '';
			createFormat = defaultTitleFormat;
		};
	}
</script>

<main class="container mx-auto max-w-3xl p-8">
	<h1 class="mb-8 text-3xl font-bold">Events</h1>

	{#each data.events as event (event._id)}
		<div transition:slide={{ duration: 200 }}>
			{#if editing === event._id}
				<form
					method="POST"
					action="?/update"
					use:enhance={afterUpdate}
					class="mb-4 space-y-3 rounded-lg border p-4"
				>
					<input type="hidden" name="id" value={event._id} />
					<div class="flex items-center gap-2">
						<label for="edit-name" class="sr-only">Name</label>
						<input
							id="edit-name"
							name="name"
							bind:value={editName}
							required
							class="flex-1 rounded border px-3 py-2"
						/>
						<label for="edit-year" class="sr-only">Year</label>
						<input
							id="edit-year"
							name="year"
							type="number"
							bind:value={editYear}
							required
							class="w-24 rounded border px-3 py-2"
						/>
					</div>
					<div>
						<label for="edit-youtubePlaylistId" class="mb-1 block text-sm text-gray-500"
							>YouTube playlist</label
						>
						<input
							id="edit-youtubePlaylistId"
							name="youtubePlaylistId"
							bind:value={editPlaylistId}
							placeholder="Playlist URL or ID"
							class="w-full rounded border px-3 py-2"
						/>
					</div>
					<div>
						<label for="edit-titleFormat" class="mb-1 block text-sm text-gray-500"
							>Title format</label
						>
						<input
							id="edit-titleFormat"
							name="titleFormat"
							bind:this={editInput}
							bind:value={editFormat}
							class="w-full rounded border px-3 py-2 font-mono text-sm"
						/>
						<div class="mt-1 flex gap-1">
							{#each titleTokens as token (token)}
								<button
									type="button"
									onclick={() => insertAtCursor(editInput, token, (v) => (editFormat = v))}
									class="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600 hover:bg-gray-200"
									>{token}</button
								>
							{/each}
						</div>
						<p class="mt-2 text-sm text-gray-400">
							Preview: <span class="text-gray-600">{preview(editFormat, editName, editYear)}</span>
						</p>
					</div>
					<div class="flex gap-2">
						<button type="submit" class="rounded bg-blue-500 px-3 py-2 text-white hover:bg-blue-600"
							>Save</button
						>
						<button
							type="button"
							onclick={() => (editing = null)}
							class="rounded bg-gray-200 px-3 py-2 hover:bg-gray-300">Cancel</button
						>
					</div>
				</form>
			{:else}
				<div class="mb-4 rounded-lg border p-4">
					<div class="flex items-center justify-between">
						<div>
							<span class="text-lg"
								>{event.name} <span class="text-gray-400">({event.year})</span></span
							>
							<p class="mt-1 text-sm text-gray-400">
								{preview(event.titleFormat ?? defaultTitleFormat, event.name, event.year ?? 0)}
							</p>
							{#if event.youtubePlaylistId}
								<p class="mt-1 text-xs text-gray-500">
									Playlist:
									<a
										href={youtubePlaylistUrl(event.youtubePlaylistId)}
										target="_blank"
										rel="noreferrer"
										class="font-mono text-blue-600 hover:underline"
									>
										{event.youtubePlaylistId}
									</a>
								</p>
							{/if}
						</div>
						<div class="flex gap-2">
							{#if event.youtubePlaylistId}
								<a
									href={`/events/${event._id}/playlist`}
									class="text-sm text-gray-700 hover:underline">Playlist</a
								>
							{/if}
							<button
								onclick={() => startEditing(event)}
								class="text-sm text-blue-500 hover:underline">Edit</button
							>
							<form method="POST" action="?/remove" use:enhance>
								<input type="hidden" name="id" value={event._id} />
								<button type="submit" class="text-sm text-red-500 hover:underline">Delete</button>
							</form>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<p class="mb-8 text-gray-500">No events yet.</p>
	{/each}

	<form
		method="POST"
		action="?/create"
		use:enhance={afterCreate}
		class="space-y-3 rounded-lg border p-4"
	>
		<div class="flex items-center gap-2">
			<label for="name" class="sr-only">Name</label>
			<input
				id="name"
				name="name"
				bind:value={createName}
				required
				placeholder="Event name"
				class="flex-1 rounded border px-3 py-2"
			/>
			<label for="year" class="sr-only">Year</label>
			<input
				id="year"
				name="year"
				type="number"
				bind:value={createYear}
				required
				placeholder="Year"
				class="w-24 rounded border px-3 py-2"
			/>
		</div>
		<div>
			<label for="youtubePlaylistId" class="mb-1 block text-sm text-gray-500"
				>YouTube playlist</label
			>
			<input
				id="youtubePlaylistId"
				name="youtubePlaylistId"
				bind:value={createPlaylistId}
				placeholder="Playlist URL or ID"
				class="w-full rounded border px-3 py-2"
			/>
		</div>
		<div>
			<label for="titleFormat" class="mb-1 block text-sm text-gray-500">Title format</label>
			<input
				id="titleFormat"
				name="titleFormat"
				bind:this={createInput}
				bind:value={createFormat}
				class="w-full rounded border px-3 py-2 font-mono text-sm"
			/>
			<div class="mt-1 flex gap-1">
				{#each titleTokens as token (token)}
					<button
						type="button"
						onclick={() => insertAtCursor(createInput, token, (v) => (createFormat = v))}
						class="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600 hover:bg-gray-200"
						>{token}</button
					>
				{/each}
			</div>
			<p class="mt-2 text-sm text-gray-400">
				Preview: <span class="text-gray-600">{preview(createFormat, createName, createYear)}</span>
			</p>
		</div>
		<button type="submit" class="rounded bg-green-500 px-3 py-2 text-white hover:bg-green-600"
			>Add</button
		>
	</form>
</main>
