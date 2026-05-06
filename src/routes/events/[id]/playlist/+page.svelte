<script lang="ts">
	import {
		deriveBaseTitle,
		formatVideoTitle,
		normalizeTitleFormat,
		previewVideoTitle
	} from '$lib/title-format';
	import {
		validateVideoBaseline,
		youtubeTitleFocusLength,
		type VideoValidation
	} from '$lib/video-validation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let copiedVideoId = $state<string | null>(null);
	let titleQualityValidationsByVideoId = $state<Record<string, VideoValidation[]>>({});
	let titleQualityError = $state<string | null>(null);
	let titleQualityLoading = $state(false);

	onMount(() => {
		void loadTitleQuality();
	});

	function formattedTitle(videoTitle: string) {
		const baseTitle = deriveBaseTitle(videoTitle, data.event.titleFormat, data.event);
		return formatVideoTitle(data.event.titleFormat, baseTitle, data.event);
	}

	function baselineValidations(videoTitle: string) {
		return validateVideoBaseline(videoTitle, data.event);
	}

	function titleQualityValidations(videoId: string) {
		return titleQualityValidationsByVideoId[videoId] ?? [];
	}

	function validationsForVideo(videoId: string, videoTitle: string) {
		return [...baselineValidations(videoTitle), ...titleQualityValidations(videoId)];
	}

	function titleFocusParts(title: string) {
		return {
			focus: title.slice(0, youtubeTitleFocusLength),
			rest: title.slice(youtubeTitleFocusLength)
		};
	}

	function baselineSummary() {
		if (!data.playlist) {
			return { passing: 0, total: 0 };
		}

		const checks = data.playlist.videos.flatMap((video) =>
			baselineValidations(video.title).filter((check) => check.id === 'title-event-suffix')
		);
		const actionableChecks = checks.filter((check) => check.status !== 'info');

		return {
			passing: actionableChecks.filter((check) => check.status === 'pass').length,
			total: actionableChecks.length
		};
	}

	function titleQualitySummary() {
		if (!data.playlist) {
			return { checked: 0, total: 0 };
		}

		return {
			checked: data.playlist.videos.filter(
				(video) => titleQualityValidationsByVideoId[video.videoId]?.length
			).length,
			total: data.playlist.videos.length
		};
	}

	function validationClass(status: VideoValidation['status']) {
		return {
			pass: 'border-green-200 bg-green-50 text-green-700',
			fail: 'border-amber-200 bg-amber-50 text-amber-800',
			info: 'border-gray-200 bg-gray-50 text-gray-600'
		}[status];
	}

	function formatDate(value?: string) {
		if (!value) return 'Unpublished';

		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(new Date(value));
	}

	async function copyTitle(videoId: string, title: string) {
		await navigator.clipboard.writeText(title);
		copiedVideoId = videoId;

		setTimeout(() => {
			if (copiedVideoId === videoId) copiedVideoId = null;
		}, 1600);
	}

	async function loadTitleQuality() {
		const playlist = data.playlist;

		if (!playlist?.videos.length) {
			return;
		}

		titleQualityLoading = true;
		titleQualityError = null;

		try {
			const response = await fetch(`/events/${data.event._id}/playlist/title-quality`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					titles: playlist.videos.map((video) => ({
						videoId: video.videoId,
						title: video.title
					}))
				})
			});
			const body = (await response.json().catch(() => ({}))) as {
				validationsByVideoId?: Record<string, VideoValidation[]>;
				error?: string | null;
			};

			titleQualityValidationsByVideoId = body.validationsByVideoId ?? {};
			titleQualityError =
				body.error ??
				(response.ok ? null : `Title quality validation failed with ${response.status}.`);
		} catch {
			titleQualityError = 'Title quality validation is temporarily unavailable.';
		} finally {
			titleQualityLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{data.event.name} Playlist</title>
</svelte:head>

<main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<div>
			<a href="/events" class="text-sm text-blue-600 hover:underline">Events</a>
			<h1 class="mt-2 text-3xl font-bold tracking-normal text-gray-950">{data.event.name}</h1>
			<p class="mt-1 text-sm text-gray-500">
				{data.event.year} · {normalizeTitleFormat(data.event.titleFormat)}
			</p>
		</div>
		<a
			href="/events"
			class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
		>
			Edit Event
		</a>
	</div>

	{#if !data.event.youtubePlaylistId}
		<section class="rounded-lg border border-amber-200 bg-amber-50 p-5">
			<h2 class="text-lg font-semibold text-amber-950">No playlist linked</h2>
			<p class="mt-1 text-sm text-amber-800">
				Add a YouTube playlist URL or ID to this event before inspecting videos.
			</p>
		</section>
	{:else if data.playlistError}
		<section class="rounded-lg border border-red-200 bg-red-50 p-5">
			<h2 class="text-lg font-semibold text-red-950">Could not load playlist</h2>
			<p class="mt-1 text-sm text-red-700">{data.playlistError.message}</p>
		</section>
	{:else if data.playlist}
		{@const summary = baselineSummary()}
		{@const titleQuality = titleQualitySummary()}
		<section class="mb-6 rounded-lg border border-gray-200 bg-white p-5">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p class="text-sm font-medium text-gray-500">Linked Playlist</p>
					<h2 class="mt-1 text-xl font-semibold text-gray-950">{data.playlist.title}</h2>
					<p class="mt-1 text-sm text-gray-500">
						{data.playlist.channelTitle} · {data.playlist.videos.length} loaded
						{#if data.playlist.itemCount !== undefined}
							· {data.playlist.itemCount} total
						{/if}
					</p>
					{#if summary.total > 0}
						<p class="mt-1 text-sm text-gray-500">
							{summary.passing}/{summary.total} titles include the event suffix
						</p>
					{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					<a
						href={data.playlist.url}
						target="_blank"
						rel="noreferrer"
						class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>
						Open Playlist
					</a>
					<a
						href={data.playlist.studioContentUrl}
						target="_blank"
						rel="noreferrer"
						class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>
						Studio Content
					</a>
					<a
						href={data.playlist.studioEditUrl}
						target="_blank"
						rel="noreferrer"
						class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>
						Studio Edit
					</a>
					<a
						href={`/events/${data.event._id}/playlist`}
						class="rounded bg-gray-950 px-3 py-2 text-sm text-white hover:bg-gray-800"
					>
						Refresh
					</a>
				</div>
			</div>
			<div class="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
				<p class="text-xs font-medium text-gray-500 uppercase">Title preview</p>
				<p class="mt-1 text-sm text-gray-700">
					{previewVideoTitle(
						normalizeTitleFormat(data.event.titleFormat),
						data.event.name,
						data.event.year ?? new Date().getFullYear()
					)}
				</p>
				<p class="mt-1 text-xs text-gray-500">
					First {youtubeTitleFocusLength} characters are highlighted in each title.
				</p>
				{#if titleQualityLoading}
					<p class="mt-1 text-xs text-gray-500">Checking title quality...</p>
				{:else if titleQualityError}
					<p class="mt-1 text-xs text-amber-700">{titleQualityError}</p>
				{:else}
					<p class="mt-1 text-xs text-gray-500">
						AI title checks: {titleQuality.checked}/{titleQuality.total}
					</p>
				{/if}
			</div>
		</section>

		<section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
			<div
				class="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500 uppercase md:grid-cols-[84px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_220px]"
			>
				<div>Video</div>
				<div>Current</div>
				<div class="hidden md:block">Validation</div>
				<div class="hidden md:block">Formatted</div>
				<div class="hidden md:block">Actions</div>
			</div>

			{#each data.playlist.videos as video (video.playlistItemId)}
				{@const nextTitle = formattedTitle(video.title)}
				{@const validations = validationsForVideo(video.videoId, video.title)}
				{@const currentTitleParts = titleFocusParts(video.title)}
				{@const formattedTitleParts = titleFocusParts(nextTitle)}
				<article
					class="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0 md:grid-cols-[84px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_220px]"
				>
					<a href={video.playlistVideoUrl} target="_blank" rel="noreferrer" class="block">
						{#if video.thumbnailUrl}
							<img
								src={video.thumbnailUrl}
								alt=""
								class="aspect-video w-full rounded border border-gray-200 object-cover"
								loading="lazy"
							/>
						{:else}
							<div class="aspect-video rounded border border-gray-200 bg-gray-100"></div>
						{/if}
					</a>
					<div class="min-w-0">
						<p class="text-xs text-gray-400">
							#{video.position + 1} · {formatDate(video.videoPublishedAt)}
						</p>
						<h3 class="mt-1 text-sm font-medium text-gray-950">
							<span class="rounded bg-blue-50 px-0.5 text-blue-950">{currentTitleParts.focus}</span
							><span class="text-gray-500">{currentTitleParts.rest}</span>
						</h3>
						<p class="mt-1 text-xs break-all text-gray-500">{video.videoId}</p>
						<div class="mt-3 flex flex-wrap gap-2 md:hidden">
							{#each validations as validation (validation.id)}
								<span
									class={`rounded border px-2 py-1 text-xs ${validationClass(validation.status)}`}
								>
									{validation.message}
								</span>
							{/each}
						</div>
						<div class="mt-3 flex flex-wrap gap-2 md:hidden">
							<a
								href={`/videos/${video.videoId}`}
								class="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Details</a
							>
							<a
								href={video.playlistVideoUrl}
								target="_blank"
								rel="noreferrer"
								class="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Watch</a
							>
							<a
								href={video.studioEditUrl}
								target="_blank"
								rel="noreferrer"
								class="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">Studio</a
							>
							<button
								type="button"
								onclick={() => copyTitle(video.videoId, nextTitle)}
								class="rounded bg-gray-950 px-2 py-1 text-xs text-white"
							>
								{copiedVideoId === video.videoId ? 'Copied' : 'Copy Title'}
							</button>
						</div>
					</div>
					<div class="hidden min-w-0 md:block">
						<div class="flex flex-wrap gap-2">
							{#each validations as validation (validation.id)}
								<span
									class={`rounded border px-2 py-1 text-xs ${validationClass(validation.status)}`}
									title={validation.expected ? `Expected: ${validation.expected}` : undefined}
								>
									{validation.message}
								</span>
							{/each}
						</div>
						{#each validations as validation (validation.id)}
							{#if validation.expected && validation.status === 'fail'}
								<p class="mt-2 text-xs text-gray-500">Expected: {validation.expected}</p>
							{/if}
							{#if validation.details?.length}
								<p class="mt-2 text-xs text-gray-500">{validation.details.join(' ')}</p>
							{/if}
							{#if validation.suggested}
								<p class="mt-1 text-xs text-gray-500">Suggested: {validation.suggested}</p>
							{/if}
						{/each}
					</div>
					<div class="hidden min-w-0 md:block">
						<p class="text-sm text-gray-900">
							<span class="rounded bg-blue-50 px-0.5 text-blue-950"
								>{formattedTitleParts.focus}</span
							><span class="text-gray-500">{formattedTitleParts.rest}</span>
						</p>
						{#if nextTitle === video.title}
							<p class="mt-1 text-xs text-green-600">Matches current title</p>
						{/if}
					</div>
					<div class="hidden items-start gap-2 md:flex">
						<a
							href={`/videos/${video.videoId}`}
							class="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
							>Details</a
						>
						<a
							href={video.playlistVideoUrl}
							target="_blank"
							rel="noreferrer"
							class="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
							>Watch</a
						>
						<a
							href={video.studioEditUrl}
							target="_blank"
							rel="noreferrer"
							class="rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
							>Studio</a
						>
						<button
							type="button"
							onclick={() => copyTitle(video.videoId, nextTitle)}
							class="rounded bg-gray-950 px-2.5 py-1.5 text-xs text-white hover:bg-gray-800"
						>
							{copiedVideoId === video.videoId ? 'Copied' : 'Copy Title'}
						</button>
					</div>
				</article>
			{:else}
				<p class="px-4 py-8 text-sm text-gray-500">No public videos found in this playlist.</p>
			{/each}
		</section>
	{/if}
</main>
