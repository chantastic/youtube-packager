<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		defaultEventType,
		defaultVideoTypeForEventType,
		eventTypeLabelFor,
		eventTypeOptions,
		normalizeEventType
	} from '$lib/event-type';
	import {
		defaultTitleFormat,
		previewVideoTitle,
		titleTokens,
		videoTypeLabelFor
	} from '$lib/title-format';
	import { youtubePlaylistUrl } from '$lib/youtube';
	import ModalDialog from '$lib/components/ModalDialog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let creating = $state(false);
	let editing = $state<string | null>(null);

	let createFormat = $state(defaultTitleFormat);
	let createName = $state('');
	let createEditionTitle = $state('');
	let createEventType = $state(defaultEventType);
	let createYear = $state(new Date().getFullYear());
	let createPlaylistId = $state('');
	let createInput = $state<HTMLInputElement | null>(null);

	let editFormat = $state('');
	let editName = $state('');
	let editEditionTitle = $state('');
	let editEventType = $state(defaultEventType);
	let editYear = $state(new Date().getFullYear());
	let editPlaylistId = $state('');
	let editInput = $state<HTMLInputElement | null>(null);

	type PlaylistStats = PageData['playlistStatsByEventId'][string];
	type EventRow = PageData['events'][number];

	function preview(format: string, name: string, year: number, editionTitle?: string) {
		return previewVideoTitle(format, name, year, editionTitle);
	}

	function eventDisplayTitle(event: { name: string; editionTitle?: string }) {
		return event.editionTitle ? `${event.name}: ${event.editionTitle}` : event.name;
	}

	function titlePreviewFor(event: EventRow) {
		return preview(
			event.titleFormat ?? defaultTitleFormat,
			event.name,
			event.year ?? 0,
			event.editionTitle
		);
	}

	function titleFormatLabel(event: EventRow) {
		return event.titleFormat && event.titleFormat !== defaultTitleFormat
			? 'Custom title format'
			: 'Default title format';
	}

	function playlistStatsFor(eventId: string) {
		return data.playlistStatsByEventId[eventId];
	}

	function validationStat(stats: PlaylistStats | undefined, id: string) {
		return stats?.validationStats.find((validation) => validation.id === id);
	}

	function badgeClass(tone: 'neutral' | 'pass' | 'warn') {
		return {
			neutral: 'border-gray-200 bg-gray-50 text-gray-600',
			pass: 'border-green-200 bg-green-50 text-green-700',
			warn: 'border-amber-200 bg-amber-50 text-amber-800'
		}[tone];
	}

	function suffixSummary(stats: PlaylistStats | undefined) {
		const suffixStats = validationStat(stats, 'title-event-suffix');
		const total = suffixStats ? suffixStats.passCount + suffixStats.failCount : 0;

		if (!stats) return { label: 'Not synced', tone: 'neutral' as const };
		if (!suffixStats || total === 0) return { label: 'No suffix rule', tone: 'neutral' as const };
		if (suffixStats.failCount > 0) {
			return {
				label: `${suffixStats.passCount}/${total} title suffix`,
				tone: 'warn' as const
			};
		}

		return { label: 'Title suffix OK', tone: 'pass' as const };
	}

	function formatSyncDate(value: number) {
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
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

	function eventCountLabel() {
		return `${data.events.length} ${data.events.length === 1 ? 'event' : 'events'}`;
	}

	function linkedEventCount() {
		return data.events.filter((event) => event.youtubePlaylistId).length;
	}

	function resetCreateForm() {
		createName = '';
		createEditionTitle = '';
		createEventType = defaultEventType;
		createYear = new Date().getFullYear();
		createPlaylistId = '';
		createFormat = defaultTitleFormat;
	}

	function startCreating() {
		resetCreateForm();
		creating = true;
	}

	function startEditing(event: EventRow) {
		editing = event._id;
		editName = event.name;
		editEditionTitle = event.editionTitle ?? '';
		editEventType = normalizeEventType(event.eventType);
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
			creating = false;
			resetCreateForm();
		};
	}
</script>

<main class="min-h-screen bg-gray-50">
	<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		<header class="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="text-sm font-medium text-gray-500">YouTube Packager</p>
				<h1 class="mt-1 text-3xl font-semibold tracking-normal text-gray-950">Events</h1>
			</div>
			<div class="flex flex-col gap-3 sm:items-end">
				<div class="grid grid-cols-2 gap-3 sm:w-80">
					<div class="rounded border border-gray-200 bg-white px-3 py-2">
						<p class="text-xs font-medium text-gray-500">Total</p>
						<p class="mt-1 text-lg font-semibold text-gray-950">{eventCountLabel()}</p>
					</div>
					<div class="rounded border border-gray-200 bg-white px-3 py-2">
						<p class="text-xs font-medium text-gray-500">Playlists</p>
						<p class="mt-1 text-lg font-semibold text-gray-950">{linkedEventCount()} linked</p>
					</div>
				</div>
				<button
					type="button"
					class="w-full rounded bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 sm:w-auto"
					onclick={startCreating}
				>
					New Event
				</button>
			</div>
		</header>

		<section aria-labelledby="event-list-title">
			<div class="mb-3 flex items-center justify-between">
				<h2 id="event-list-title" class="text-sm font-semibold text-gray-950">Event Library</h2>
				<p class="text-sm text-gray-500">{eventCountLabel()}</p>
			</div>

			{#if data.events.length}
				<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
					{#each data.events as event (event._id)}
						{@const playlistStats = playlistStatsFor(event._id)}
						{@const suffix = suffixSummary(playlistStats)}
						<div class="border-b border-gray-100 last:border-b-0">
							<article class="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<h3 class="min-w-0 text-base font-semibold text-gray-950">
											{eventDisplayTitle(event)}
										</h3>
										<span class="text-sm text-gray-400">{event.year}</span>
										<span
											class="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
										>
											{eventTypeLabelFor(event.eventType)}
										</span>
									</div>
									{#if event.editionTitle}
										<p class="mt-1 text-sm text-gray-500">
											{event.name} / {event.editionTitle}
										</p>
									{/if}
									<dl class="mt-4 grid gap-4 text-sm sm:grid-cols-2">
										<div>
											<dt class="text-xs font-medium text-gray-500 uppercase">Video Default</dt>
											<dd class="mt-1 text-gray-950">
												{videoTypeLabelFor(defaultVideoTypeForEventType(event.eventType))}
											</dd>
										</div>
										<div>
											<dt class="text-xs font-medium text-gray-500 uppercase">Title Rule</dt>
											<dd class="mt-1 text-gray-950">{titleFormatLabel(event)}</dd>
											<dd class="mt-1 min-w-0 truncate font-mono text-xs text-gray-500">
												{titlePreviewFor(event)}
											</dd>
										</div>
										<div class="sm:col-span-2">
											<dt class="text-xs font-medium text-gray-500 uppercase">Playlist</dt>
											<dd class="mt-1 min-w-0">
												{#if event.youtubePlaylistId}
													<a
														href={youtubePlaylistUrl(event.youtubePlaylistId)}
														target="_blank"
														rel="noreferrer"
														class="font-mono text-xs text-blue-600 hover:underline"
													>
														{event.youtubePlaylistId}
													</a>
												{:else}
													<span class="text-sm text-gray-500">Not linked</span>
												{/if}
											</dd>
										</div>
									</dl>
								</div>
								<div class="flex flex-col gap-4 lg:items-end">
									<div class="grid w-full grid-cols-2 gap-2 lg:grid-cols-1">
										<div class="rounded border border-gray-200 px-3 py-2">
											<p class="text-xs font-medium text-gray-500">Videos</p>
											<p class="mt-1 text-sm font-semibold text-gray-950">
												{playlistStats
													? playlistStats.videoCount
													: event.youtubePlaylistId
														? 'Sync needed'
														: 'No playlist'}
											</p>
										</div>
										<div class={`rounded border px-3 py-2 ${badgeClass(suffix.tone)}`}>
											<p class="text-xs font-medium">Validation</p>
											<p class="mt-1 text-sm font-semibold">{suffix.label}</p>
										</div>
										{#if playlistStats}
											<div
												class="col-span-2 rounded border border-gray-200 px-3 py-2 text-gray-600 lg:col-span-1"
											>
												<p class="text-xs font-medium text-gray-500">Last Sync</p>
												<p class="mt-1 text-sm font-semibold text-gray-950">
													{formatSyncDate(playlistStats.lastFetchedAt)}
												</p>
											</div>
										{/if}
									</div>
									<div class="flex flex-wrap gap-2 lg:justify-end">
										{#if event.youtubePlaylistId}
											<a
												href={`/events/${event._id}/playlist`}
												class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
											>
												Playlist
											</a>
										{/if}
										<button
											type="button"
											onclick={() => startEditing(event)}
											class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
										>
											Edit
										</button>
										<form method="POST" action="?/remove" use:enhance>
											<input type="hidden" name="id" value={event._id} />
											<button
												type="submit"
												class="rounded border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
											>
												Delete
											</button>
										</form>
									</div>
								</div>
							</article>
						</div>
					{/each}
				</div>
			{:else}
				<div
					class="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-10 text-center"
				>
					<h2 class="text-base font-semibold text-gray-950">No events yet</h2>
					<p class="mt-1 text-sm text-gray-500">Create one to start packaging a playlist.</p>
					<button
						type="button"
						class="mt-4 rounded bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
						onclick={startCreating}
					>
						New Event
					</button>
				</div>
			{/if}
		</section>

		<ModalDialog
			id="create-event"
			open={creating}
			title="New Event"
			description="Create an event record and connect it to a YouTube playlist."
			onClose={() => (creating = false)}
		>
			<form
				method="POST"
				action="?/create"
				use:enhance={afterCreate}
				class="flex min-h-full flex-col"
			>
				<div class="flex-1 space-y-5">
					<div>
						<label for="create-name" class="mb-1 block text-sm font-medium text-gray-700"
							>Name</label
						>
						<input
							id="create-name"
							name="name"
							data-autofocus
							bind:value={createName}
							required
							placeholder="MCP Night"
							class="w-full rounded border-gray-300 text-sm shadow-sm"
						/>
					</div>
					<div class="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
						<div>
							<label for="create-editionTitle" class="mb-1 block text-sm font-medium text-gray-700">
								Edition
							</label>
							<input
								id="create-editionTitle"
								name="editionTitle"
								bind:value={createEditionTitle}
								placeholder="Holiday Special"
								class="w-full rounded border-gray-300 text-sm shadow-sm"
							/>
						</div>
						<div>
							<label for="create-year" class="mb-1 block text-sm font-medium text-gray-700"
								>Year</label
							>
							<input
								id="create-year"
								name="year"
								type="number"
								bind:value={createYear}
								required
								class="w-full rounded border-gray-300 text-sm shadow-sm"
							/>
						</div>
					</div>
					<div>
						<label for="create-eventType" class="mb-1 block text-sm font-medium text-gray-700"
							>Type</label
						>
						<select
							id="create-eventType"
							name="eventType"
							bind:value={createEventType}
							class="w-full rounded border-gray-300 text-sm shadow-sm"
						>
							{#each eventTypeOptions as option (option.value)}
								<option value={option.value}>
									{option.label} / {videoTypeLabelFor(option.defaultVideoType)}
								</option>
							{/each}
						</select>
					</div>
					<div>
						<label
							for="create-youtubePlaylistId"
							class="mb-1 block text-sm font-medium text-gray-700"
						>
							YouTube Playlist
						</label>
						<input
							id="create-youtubePlaylistId"
							name="youtubePlaylistId"
							bind:value={createPlaylistId}
							placeholder="Playlist URL or ID"
							class="w-full rounded border-gray-300 text-sm shadow-sm"
						/>
					</div>
					<div>
						<label for="create-titleFormat" class="mb-1 block text-sm font-medium text-gray-700">
							Event Title Format
						</label>
						<input
							id="create-titleFormat"
							name="titleFormat"
							bind:this={createInput}
							bind:value={createFormat}
							class="w-full rounded border-gray-300 font-mono text-sm shadow-sm"
						/>
						<div class="mt-2 flex flex-wrap gap-1">
							{#each titleTokens as token (token)}
								<button
									type="button"
									onclick={() => insertAtCursor(createInput, token, (v) => (createFormat = v))}
									class="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-600 hover:bg-gray-100"
									>{token}</button
								>
							{/each}
						</div>
					</div>
					<div class="rounded border border-gray-200 bg-gray-50 px-3 py-2">
						<p class="text-xs font-medium text-gray-500">Preview</p>
						<p class="mt-1 min-w-0 truncate text-sm text-gray-950">
							{preview(createFormat, createName, createYear, createEditionTitle)}
						</p>
					</div>
				</div>
				<div
					class="sticky bottom-0 -mx-5 mt-6 border-t border-gray-200 bg-white px-5 py-4 sm:-mx-6 sm:px-6"
				>
					<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<button
							type="button"
							class="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
							onclick={() => (creating = false)}
						>
							Cancel
						</button>
						<button
							type="submit"
							class="rounded bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
						>
							Add Event
						</button>
					</div>
				</div>
			</form>
		</ModalDialog>

		<ModalDialog
			id="edit-event"
			open={editing !== null}
			title={editName ? `Edit ${editName}` : 'Edit Event'}
			description="Update event metadata, default video type, and playlist connection."
			onClose={() => (editing = null)}
		>
			<form
				method="POST"
				action="?/update"
				use:enhance={afterUpdate}
				class="flex min-h-full flex-col"
			>
				<input type="hidden" name="id" value={editing ?? ''} />
				<div class="flex-1 space-y-5">
					<div>
						<label for="edit-name" class="mb-1 block text-sm font-medium text-gray-700">Name</label>
						<input
							id="edit-name"
							name="name"
							data-autofocus
							bind:value={editName}
							required
							class="w-full rounded border-gray-300 text-sm shadow-sm"
						/>
					</div>
					<div class="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
						<div>
							<label for="edit-editionTitle" class="mb-1 block text-sm font-medium text-gray-700">
								Edition
							</label>
							<input
								id="edit-editionTitle"
								name="editionTitle"
								bind:value={editEditionTitle}
								class="w-full rounded border-gray-300 text-sm shadow-sm"
							/>
						</div>
						<div>
							<label for="edit-year" class="mb-1 block text-sm font-medium text-gray-700"
								>Year</label
							>
							<input
								id="edit-year"
								name="year"
								type="number"
								bind:value={editYear}
								required
								class="w-full rounded border-gray-300 text-sm shadow-sm"
							/>
						</div>
					</div>
					<div>
						<label for="edit-eventType" class="mb-1 block text-sm font-medium text-gray-700"
							>Type</label
						>
						<select
							id="edit-eventType"
							name="eventType"
							bind:value={editEventType}
							class="w-full rounded border-gray-300 text-sm shadow-sm"
						>
							{#each eventTypeOptions as option (option.value)}
								<option value={option.value}>
									{option.label} / {videoTypeLabelFor(option.defaultVideoType)}
								</option>
							{/each}
						</select>
					</div>
					<div>
						<label
							for="edit-youtubePlaylistId"
							class="mb-1 block text-sm font-medium text-gray-700"
						>
							YouTube Playlist
						</label>
						<input
							id="edit-youtubePlaylistId"
							name="youtubePlaylistId"
							bind:value={editPlaylistId}
							placeholder="Playlist URL or ID"
							class="w-full rounded border-gray-300 text-sm shadow-sm"
						/>
					</div>
					<div>
						<label for="edit-titleFormat" class="mb-1 block text-sm font-medium text-gray-700">
							Event Title Format
						</label>
						<input
							id="edit-titleFormat"
							name="titleFormat"
							bind:this={editInput}
							bind:value={editFormat}
							class="w-full rounded border-gray-300 font-mono text-sm shadow-sm"
						/>
						<div class="mt-2 flex flex-wrap gap-1">
							{#each titleTokens as token (token)}
								<button
									type="button"
									onclick={() => insertAtCursor(editInput, token, (v) => (editFormat = v))}
									class="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-600 hover:bg-gray-100"
									>{token}</button
								>
							{/each}
						</div>
					</div>
					<div class="rounded border border-gray-200 bg-gray-50 px-3 py-2">
						<p class="text-xs font-medium text-gray-500">Preview</p>
						<p class="mt-1 min-w-0 truncate text-sm text-gray-950">
							{preview(editFormat, editName, editYear, editEditionTitle)}
						</p>
					</div>
				</div>
				<div
					class="sticky bottom-0 -mx-5 mt-6 border-t border-gray-200 bg-white px-5 py-4 sm:-mx-6 sm:px-6"
				>
					<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<button
							type="button"
							class="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
							onclick={() => (editing = null)}
						>
							Cancel
						</button>
						<button
							type="submit"
							class="rounded bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
						>
							Save Changes
						</button>
					</div>
				</div>
			</form>
		</ModalDialog>
	</div>
</main>
