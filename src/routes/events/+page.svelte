<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { eventTypeLabelFor, eventTypeOptions } from '$lib/event-type';
	import ExternalLinkButton from '$lib/components/ExternalLinkButton.svelte';
	import LighthouseScoreButton from '$lib/components/LighthouseScoreButton.svelte';
	import LighthouseScoreLink from '$lib/components/LighthouseScoreLink.svelte';
	import ModalDialog from '$lib/components/ModalDialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { youtubePlaylistUrl } from '$lib/youtube';
	import { Plus } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let buildingEventId = $state<string | null>(null);
	let createDialogOpen = $state(false);
	const currentYear = new Date().getFullYear();

	type EventRow = PageData['events'][number];
	type ValidationStat = PageData['validationStatsByEventId'][string][number];

	function eventDisplayTitle(event: { name: string; editionTitle?: string }) {
		return event.editionTitle ? `${event.name}: ${event.editionTitle}` : event.name;
	}

	function validationStatsFor(eventId: string) {
		return data.validationStatsByEventId[eventId];
	}

	function validationBuildStateFor(eventId: string) {
		return data.validationBuildStateByEventId[eventId];
	}

	function eventHref(event: EventRow) {
		return resolve('/events/[id]', { id: event._id });
	}

	function validationStatus(stat: ValidationStat): 'fail' | 'pass' | 'info' | 'pending' {
		if (stat.failCount > 0) return 'fail';
		if (stat.passCount > 0) return 'pass';
		if (stat.pendingCount > 0) return 'pending';
		return 'info';
	}

	function validationHref(event: EventRow, stat: ValidationStat) {
		const params = new URLSearchParams({
			validation: stat.id,
			status: validationStatus(stat)
		});

		return `${eventHref(event)}?${params}`;
	}

	function validationTotal(stat: ValidationStat) {
		return stat.passCount + stat.failCount;
	}

	function validationScore(stat: ValidationStat) {
		const total = validationTotal(stat);

		return total > 0 ? Math.round((stat.passCount / total) * 100) : undefined;
	}

	function scoreLabel(stat: ValidationStat) {
		if (stat.failCount > 0) {
			return stat.pendingCount > 0
				? `${stat.failCount} failing, ${stat.pendingCount} pending`
				: `${stat.failCount} failing`;
		}

		if (stat.passCount > 0) {
			return stat.pendingCount > 0 ? `Clear, ${stat.pendingCount} pending` : 'Clear';
		}

		if (stat.pendingCount > 0) {
			return `${stat.pendingCount} pending`;
		}

		return `${stat.infoCount} info`;
	}

	function buildTileLabel(
		buildState: NonNullable<PageData['validationBuildStateByEventId'][string]>
	) {
		return buildState.kind === 'ai' ? 'AI Checks' : 'Validations';
	}

	function buildTileDetail(
		eventId: string,
		buildState: NonNullable<PageData['validationBuildStateByEventId'][string]>
	) {
		if (buildingEventId === eventId) return 'Building';

		return buildState.kind === 'ai' ? 'Build' : 'Sync';
	}

	function buildTileTitle(
		buildState: NonNullable<PageData['validationBuildStateByEventId'][string]>
	) {
		if (buildState.kind === 'ai' && buildState.missingCount) {
			return `${buildState.missingCount} AI title checks need to be built`;
		}

		return 'Build validation data';
	}

	function afterBuild(eventId: string) {
		return () => {
			buildingEventId = eventId;

			return async ({ update }: { update: () => Promise<void> }) => {
				try {
					await update();
				} finally {
					buildingEventId = null;
				}
			};
		};
	}

	$effect(() => {
		if (form?.createError) createDialogOpen = true;
	});
</script>

<main class="min-h-screen bg-gray-50">
	<div class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
		<PageHeader eyebrow="YouTube Packager" title="Events">
			<button
				type="button"
				class="inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 focus:outline-none"
				onclick={() => (createDialogOpen = true)}
			>
				<Plus aria-hidden="true" class="h-4 w-4" />
				New event
			</button>
		</PageHeader>

		{#if form?.buildError}
			<p class="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
				{form.buildError}
			</p>
		{:else if form?.buildMessage}
			<p class="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
				{form.buildMessage}
				{#if form.buildWarning}
					<span class="block text-green-800">{form.buildWarning}</span>
				{/if}
			</p>
		{/if}

		<section aria-labelledby="event-list-title">
			<h2 id="event-list-title" class="sr-only">Event Library</h2>

			{#if data.events.length}
				<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
					{#each data.events as event (event._id)}
						{@const validationStats = validationStatsFor(event._id)}
						{@const buildState = validationBuildStateFor(event._id)}
						<article
							class="grid gap-4 border-b border-gray-100 px-4 py-5 last:border-b-0 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,auto)] lg:items-center"
						>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<a
										href={eventHref(event)}
										class="min-w-0 text-base font-semibold text-gray-950 hover:text-blue-700 hover:underline"
									>
										{eventDisplayTitle(event)}
									</a>
									{#if event.year}
										<span class="text-sm text-gray-400">{event.year}</span>
									{/if}
									<StatusBadge label={eventTypeLabelFor(event.eventType)} />
									{#if event.youtubePlaylistId}
										<ExternalLinkButton
											href={youtubePlaylistUrl(event.youtubePlaylistId)}
											label="Open YouTube playlist"
											title="Open YouTube playlist"
										/>
									{/if}
								</div>
							</div>

							<div class="flex flex-wrap gap-x-4 gap-y-3 lg:justify-end">
								{#if validationStats?.length}
									{#each validationStats as stat (stat.id)}
										{@const score = validationScore(stat)}
										<LighthouseScoreLink
											href={validationHref(event, stat)}
											label={stat.label}
											detail={scoreLabel(stat)}
											{score}
											title={`Show ${scoreLabel(stat).toLowerCase()} ${stat.label.toLowerCase()} items`}
										/>
									{/each}
									{#if buildState}
										<form
											method="POST"
											action="?/buildValidations"
											class="w-24"
											use:enhance={afterBuild(event._id)}
										>
											<input type="hidden" name="eventId" value={event._id} />
											<LighthouseScoreButton
												disabled={buildingEventId === event._id}
												label={buildTileLabel(buildState)}
												detail={buildTileDetail(event._id, buildState)}
												title={buildTileTitle(buildState)}
											/>
										</form>
									{/if}
								{:else if buildState}
									<form
										method="POST"
										action="?/buildValidations"
										class="w-24"
										use:enhance={afterBuild(event._id)}
									>
										<input type="hidden" name="eventId" value={event._id} />
										<LighthouseScoreButton
											disabled={buildingEventId === event._id}
											label={buildTileLabel(buildState)}
											detail={buildTileDetail(event._id, buildState)}
											title={buildTileTitle(buildState)}
										/>
									</form>
								{:else if event.youtubePlaylistId}
									<a
										href={eventHref(event)}
										class="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100"
									>
										No validations
									</a>
								{:else}
									<a
										href={eventHref(event)}
										class="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100"
									>
										No playlist
									</a>
								{/if}
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<div
					class="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-10 text-center"
				>
					<h2 class="text-base font-semibold text-gray-950">No events yet</h2>
					<p class="mt-1 text-sm text-gray-500">Add the first event for this organization.</p>
					<button
						type="button"
						class="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 focus:outline-none"
						onclick={() => (createDialogOpen = true)}
					>
						<Plus aria-hidden="true" class="h-4 w-4" />
						New event
					</button>
				</div>
			{/if}
		</section>
	</div>

	<ModalDialog
		id="create-event-dialog"
		open={createDialogOpen}
		title="New event"
		description="Create an event shell, then connect its YouTube playlist from the detail page."
		onClose={() => (createDialogOpen = false)}
	>
		<form method="POST" action="?/create" class="space-y-5" use:enhance>
			{#if form?.createError}
				<p class="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
					{form.createError}
				</p>
			{/if}

			<div class="grid gap-4 sm:grid-cols-2">
				<label class="sm:col-span-2">
					<span class="text-sm font-medium text-gray-700">Event name</span>
					<input
						data-autofocus
						name="name"
						required
						class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 shadow-sm focus:border-gray-950 focus:ring-1 focus:ring-gray-950 focus:outline-none"
						placeholder="MCP Night"
					/>
				</label>

				<label>
					<span class="text-sm font-medium text-gray-700">Year</span>
					<input
						name="year"
						type="number"
						required
						min="2005"
						max="2100"
						value={currentYear}
						class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 shadow-sm focus:border-gray-950 focus:ring-1 focus:ring-gray-950 focus:outline-none"
					/>
				</label>

				<label>
					<span class="text-sm font-medium text-gray-700">Event type</span>
					<select
						name="eventType"
						class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 shadow-sm focus:border-gray-950 focus:ring-1 focus:ring-gray-950 focus:outline-none"
					>
						{#each eventTypeOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				<label class="sm:col-span-2">
					<span class="text-sm font-medium text-gray-700">Edition title</span>
					<input
						name="editionTitle"
						class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 shadow-sm focus:border-gray-950 focus:ring-1 focus:ring-gray-950 focus:outline-none"
						placeholder="Holiday Special"
					/>
				</label>

				<label class="sm:col-span-2">
					<span class="text-sm font-medium text-gray-700">YouTube playlist</span>
					<input
						name="youtubePlaylistId"
						class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 shadow-sm focus:border-gray-950 focus:ring-1 focus:ring-gray-950 focus:outline-none"
						placeholder="https://www.youtube.com/playlist?list=..."
					/>
				</label>

				<label class="sm:col-span-2">
					<span class="text-sm font-medium text-gray-700">Event suffix format</span>
					<input
						name="titleFormat"
						class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 shadow-sm focus:border-gray-950 focus:ring-1 focus:ring-gray-950 focus:outline-none"
						placeholder={'| {event_name}'}
					/>
				</label>
			</div>

			<div class="flex justify-end gap-3 border-t border-gray-200 pt-5">
				<button
					type="button"
					class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 focus:outline-none"
					onclick={() => (createDialogOpen = false)}
				>
					Cancel
				</button>
				<button
					type="submit"
					class="rounded-md bg-gray-950 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 focus:outline-none"
				>
					Create event
				</button>
			</div>
		</form>
	</ModalDialog>
</main>
