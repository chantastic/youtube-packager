<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		defaultVideoTitleFormat,
		deriveComposedBaseTitle,
		formatComposedVideoTitle,
		normalizeVideoTitleFormat,
		videoTitleTokens
	} from '$lib/title-format';
	import { youtubePlaylistUrl } from '$lib/youtube';
	import type { VideoValidation } from '$lib/video-validation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	type AssignmentTitleAlternatives = {
		assignmentId: string;
		alternatives: string[];
		error: string | null;
	};

	let { data }: { data: PageData } = $props();
	let titleQualityValidations = $state<VideoValidation[]>([]);
	let titleQualityError = $state<string | null>(null);
	let titleQualityLoading = $state(false);
	let titleAlternativesByAssignmentId = $state<Record<string, AssignmentTitleAlternatives>>({});
	let titleAlternativesError = $state<string | null>(null);
	let titleAlternativesLoading = $state(false);
	let copiedTitle = $state<string | null>(null);
	let metadataSaved = $state(false);

	onMount(() => {
		void loadTitleQuality();
	});

	function formatDate(value?: number | string) {
		if (!value) return 'Unknown';

		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function validationClass(status: VideoValidation['status']) {
		return {
			pass: 'border-green-200 bg-green-50 text-green-700',
			fail: 'border-amber-200 bg-amber-50 text-amber-800',
			info: 'border-gray-200 bg-gray-50 text-gray-600'
		}[status];
	}

	function assignmentValidations(assignmentId: string) {
		return data.assignmentValidationsById[assignmentId] ?? [];
	}

	function assignmentAlternatives(assignmentId: string) {
		return titleAlternativesByAssignmentId[assignmentId];
	}

	function videoTitleRecord() {
		const speaker = data.videoView.speakers.map((row) => row.speaker.name).join(', ');
		const company = [
			...new Set(
				data.videoView.speakers
					.map((row) => row.speaker.company)
					.filter((value): value is string => Boolean(value))
			)
		].join(', ');
		const position = [
			...new Set(
				data.videoView.speakers
					.map((row) => row.speaker.position)
					.filter((value): value is string => Boolean(value))
			)
		].join(', ');

		return {
			speaker: speaker || undefined,
			company: company || undefined,
			position: position || undefined,
			videoTitleFormat: data.videoView.video.videoTitleFormat
		};
	}

	function speakerMeta(row: PageData['videoView']['speakers'][number]) {
		return [row.speaker.position, row.speaker.company].filter(Boolean).join(', ');
	}

	function composedTitle(event: PageData['videoView']['assignments'][number]['event']) {
		const video = videoTitleRecord();
		const baseTitle = deriveComposedBaseTitle(data.videoView.video.title, video, event);

		return formatComposedVideoTitle(baseTitle, video, event);
	}

	function afterMetadataUpdate() {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			metadataSaved = true;

			setTimeout(() => {
				metadataSaved = false;
			}, 1600);
		};
	}

	async function copyTitle(title: string) {
		await navigator.clipboard.writeText(title);
		copiedTitle = title;

		setTimeout(() => {
			if (copiedTitle === title) copiedTitle = null;
		}, 1600);
	}

	async function loadTitleQuality() {
		titleQualityLoading = true;
		titleQualityError = null;

		try {
			const response = await fetch(
				`/videos/${encodeURIComponent(data.videoView.video.youtubeVideoId)}/title-quality`,
				{
					method: 'POST'
				}
			);
			const body = (await response.json().catch(() => ({}))) as {
				validations?: VideoValidation[];
				error?: string | null;
			};

			titleQualityValidations = body.validations ?? [];
			titleQualityError =
				body.error ??
				(response.ok ? null : `Title quality validation failed with ${response.status}.`);
		} catch {
			titleQualityError = 'Title quality validation is temporarily unavailable.';
		} finally {
			titleQualityLoading = false;
		}
	}

	async function loadTitleAlternatives() {
		titleAlternativesLoading = true;
		titleAlternativesError = null;

		try {
			const response = await fetch(
				`/videos/${encodeURIComponent(data.videoView.video.youtubeVideoId)}/title-alternatives`,
				{
					method: 'POST'
				}
			);
			const body = (await response.json().catch(() => ({}))) as {
				alternativesByAssignmentId?: Record<string, AssignmentTitleAlternatives>;
				error?: string | null;
			};

			titleAlternativesByAssignmentId = body.alternativesByAssignmentId ?? {};
			titleAlternativesError =
				body.error ?? (response.ok ? null : `Title alternatives failed with ${response.status}.`);
		} catch {
			titleAlternativesError = 'Title alternatives are temporarily unavailable.';
		} finally {
			titleAlternativesLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{data.videoView.video.title}</title>
</svelte:head>

<main class="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<div>
			<a href="/events" class="text-sm text-blue-600 hover:underline">Events</a>
			<h1 class="mt-2 text-3xl font-bold tracking-normal text-gray-950">
				{data.videoView.video.title}
			</h1>
			<p class="mt-1 font-mono text-sm text-gray-500">{data.videoView.video.youtubeVideoId}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a
				href={data.videoView.video.videoUrl}
				target="_blank"
				rel="noreferrer"
				class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
			>
				Watch
			</a>
			<a
				href={data.videoView.video.studioEditUrl}
				target="_blank"
				rel="noreferrer"
				class="rounded bg-gray-950 px-3 py-2 text-sm text-white hover:bg-gray-800"
			>
				Studio
			</a>
		</div>
	</div>

	<section class="mb-6 grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
		{#if data.videoView.video.thumbnailUrl}
			<img
				src={data.videoView.video.thumbnailUrl}
				alt=""
				class="aspect-video w-full rounded-lg border border-gray-200 object-cover"
			/>
		{:else}
			<div class="aspect-video rounded-lg border border-gray-200 bg-gray-100"></div>
		{/if}
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<p class="text-xs font-medium text-gray-500 uppercase">Snapshot</p>
			<dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
				<div>
					<dt class="text-gray-500">Channel</dt>
					<dd class="mt-1 text-gray-950">{data.videoView.video.channelTitle ?? 'Unknown'}</dd>
				</div>
				<div>
					<dt class="text-gray-500">Published</dt>
					<dd class="mt-1 text-gray-950">{formatDate(data.videoView.video.videoPublishedAt)}</dd>
				</div>
				<div>
					<dt class="text-gray-500">Last synced</dt>
					<dd class="mt-1 text-gray-950">{formatDate(data.videoView.video.lastFetchedAt)}</dd>
				</div>
				<div>
					<dt class="text-gray-500">Assignments</dt>
					<dd class="mt-1 text-gray-950">{data.videoView.assignments.length}</dd>
				</div>
			</dl>
		</div>
	</section>

	<section class="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 bg-gray-50 px-4 py-3">
			<h2 class="text-sm font-semibold text-gray-950">Video Title Metadata</h2>
		</div>
		<form
			method="POST"
			action="?/updateMetadata"
			use:enhance={afterMetadataUpdate}
			class="px-4 py-4"
		>
			<div>
				<label for="videoTitleFormat" class="mb-1 block text-sm text-gray-500"
					>Video title format</label
				>
				<input
					id="videoTitleFormat"
					name="videoTitleFormat"
					value={normalizeVideoTitleFormat(data.videoView.video.videoTitleFormat)}
					class="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
				/>
				<div class="mt-1 flex flex-wrap gap-1">
					{#each videoTitleTokens as token (token)}
						<span class="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
							{token}
						</span>
					{/each}
				</div>
			</div>
			<div class="mt-4 flex flex-wrap items-center gap-3">
				<button
					type="submit"
					class="rounded bg-gray-950 px-3 py-2 text-sm text-white hover:bg-gray-800"
				>
					Save Metadata
				</button>
				{#if metadataSaved}
					<span class="text-sm text-green-700">Saved</span>
				{/if}
			</div>
			<p class="mt-3 text-xs text-gray-500">
				Default: <span class="font-mono">{defaultVideoTitleFormat}</span>
			</p>
		</form>
		<div class="border-t border-gray-100 px-4 py-4">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="text-sm font-semibold text-gray-950">Speakers</h3>
				<p class="text-xs text-gray-500">{data.videoView.speakers.length} assigned</p>
			</div>
			{#if data.videoView.speakers.length}
				<div class="mt-3 divide-y divide-gray-100 rounded border border-gray-200">
					{#each data.videoView.speakers as row (row.assignment._id)}
						<div class="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
							<div>
								<p class="text-sm text-gray-950">{row.speaker.name}</p>
								{#if speakerMeta(row)}
									<p class="text-xs text-gray-500">{speakerMeta(row)}</p>
								{/if}
								<p class="text-xs text-gray-500">Order #{row.assignment.position + 1}</p>
							</div>
							<form method="POST" action="?/removeSpeaker" use:enhance>
								<input type="hidden" name="speakerId" value={row.speaker._id} />
								<button
									type="submit"
									class="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
								>
									Remove
								</button>
							</form>
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-3 text-sm text-gray-500">No speakers assigned yet.</p>
			{/if}
			<form
				method="POST"
				action="?/addSpeaker"
				use:enhance
				class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
			>
				<div>
					<label for="speakerName" class="mb-1 block text-sm text-gray-500">Speaker</label>
					<input
						id="speakerName"
						name="name"
						class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label for="speakerPosition" class="mb-1 block text-sm text-gray-500">Position</label>
					<input
						id="speakerPosition"
						name="position"
						class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label for="speakerCompany" class="mb-1 block text-sm text-gray-500">Company</label>
					<input
						id="speakerCompany"
						name="company"
						class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
				</div>
				<div class="flex items-end">
					<button
						type="submit"
						class="w-full rounded bg-gray-950 px-3 py-2 text-sm text-white hover:bg-gray-800 sm:w-auto"
					>
						Add Speaker
					</button>
				</div>
			</form>
		</div>
	</section>

	<section class="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 bg-gray-50 px-4 py-3">
			<h2 class="text-sm font-semibold text-gray-950">Description</h2>
		</div>
		<div class="px-4 py-4">
			{#if data.videoView.video.description}
				<p class="text-sm break-words whitespace-pre-wrap text-gray-700">
					{data.videoView.video.description}
				</p>
			{:else}
				<p class="text-sm text-gray-500">No description synced yet.</p>
			{/if}
		</div>
	</section>

	<section class="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 bg-gray-50 px-4 py-3">
			<h2 class="text-sm font-semibold text-gray-950">Video Validations</h2>
		</div>
		<div class="px-4 py-4">
			{#if titleQualityLoading}
				<p class="text-sm text-gray-500">Checking title quality...</p>
			{:else if titleQualityError}
				<p class="text-sm text-amber-700">{titleQualityError}</p>
			{:else if titleQualityValidations.length}
				<div class="flex flex-wrap gap-2">
					{#each titleQualityValidations as validation (validation.id)}
						<span
							class={`rounded border px-2 py-1 text-xs ${validationClass(validation.status)}`}
							title={validation.expected ? `Expected: ${validation.expected}` : undefined}
						>
							{validation.label}: {validation.message}
						</span>
					{/each}
				</div>
				{#each titleQualityValidations as validation (validation.id)}
					{#if validation.details?.length}
						<p class="mt-2 text-xs text-gray-500">{validation.details.join(' ')}</p>
					{/if}
					{#if validation.suggested}
						<p class="mt-1 text-xs text-gray-500">Suggested: {validation.suggested}</p>
					{/if}
				{/each}
			{:else}
				<p class="text-sm text-gray-500">No video-level checks have returned yet.</p>
			{/if}
		</div>
	</section>

	<section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3"
		>
			<h2 class="text-sm font-semibold text-gray-950">Playlist Assignments</h2>
			<button
				type="button"
				onclick={loadTitleAlternatives}
				disabled={titleAlternativesLoading || data.videoView.assignments.length === 0}
				class="rounded bg-gray-950 px-2.5 py-1.5 text-xs text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
			>
				{titleAlternativesLoading ? 'Generating...' : 'Generate Titles'}
			</button>
		</div>
		{#if titleAlternativesError}
			<p class="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
				{titleAlternativesError}
			</p>
		{/if}
		{#each data.videoView.assignments as row (row.assignment._id)}
			{@const validations = assignmentValidations(row.assignment._id)}
			{@const alternatives = assignmentAlternatives(row.assignment._id)}
			<article
				class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0"
			>
				<div>
					<p class="font-medium text-gray-950">
						{row.event.name} <span class="text-gray-400">({row.event.year})</span>
					</p>
					<p class="mt-1 text-sm text-gray-500">
						Position #{row.assignment.position + 1} · Synced {formatDate(
							row.assignment.lastFetchedAt
						)}
					</p>
					<p class="mt-1 font-mono text-xs text-gray-500">{row.assignment.playlistId}</p>
					<p class="mt-2 text-sm text-gray-700">{composedTitle(row.event)}</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each validations as validation (validation.id)}
							<span
								class={`rounded border px-2 py-1 text-xs ${validationClass(validation.status)}`}
								title={validation.expected ? `Expected: ${validation.expected}` : undefined}
							>
								{validation.label}: {validation.message}
							</span>
						{/each}
					</div>
					{#each validations as validation (validation.id)}
						{#if validation.expected && validation.status === 'fail'}
							<p class="mt-2 text-xs text-gray-500">Expected: {validation.expected}</p>
						{/if}
					{/each}
					{#if alternatives?.alternatives.length}
						<div class="mt-4 space-y-2">
							<p class="text-xs font-medium text-gray-500 uppercase">Title alternatives</p>
							{#each alternatives.alternatives as title (title)}
								<div class="rounded border border-gray-200 bg-gray-50 p-3">
									<p class="text-sm text-gray-950">{title}</p>
									<div class="mt-2 flex flex-wrap items-center gap-2">
										<span class="text-xs text-gray-500">{title.length}/100</span>
										<button
											type="button"
											onclick={() => copyTitle(title)}
											class="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-white"
										>
											{copiedTitle === title ? 'Copied' : 'Copy'}
										</button>
									</div>
								</div>
							{/each}
						</div>
					{:else if alternatives?.error}
						<p class="mt-3 text-xs text-amber-700">{alternatives.error}</p>
					{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					<a
						href={`/events/${row.event._id}/playlist`}
						class="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
					>
						Event Playlist
					</a>
					<a
						href={youtubePlaylistUrl(row.assignment.playlistId)}
						target="_blank"
						rel="noreferrer"
						class="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
					>
						Playlist
					</a>
					<a
						href={row.assignment.playlistVideoUrl}
						target="_blank"
						rel="noreferrer"
						class="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
					>
						Watch Here
					</a>
				</div>
			</article>
		{:else}
			<p class="px-4 py-8 text-sm text-gray-500">No playlist assignments synced yet.</p>
		{/each}
	</section>
</main>
