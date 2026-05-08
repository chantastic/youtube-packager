<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import {
		deriveBaseTitle,
		deriveComposedBaseTitle,
		formatComposedVideoTitle,
		formatVideoTitle,
		getTitleHookParts,
		normalizeVideoType,
		normalizeTitleFormat,
		previewVideoTitle,
		videoTypeOptions
	} from '$lib/title-format';
	import {
		filterDisabledTitleValidations,
		validateVideoBaseline,
		youtubeTitleFocusLength,
		type VideoValidation
	} from '$lib/video-validation';
	import {
		Check,
		CirclePlay,
		ClipboardCopy,
		FileText,
		ListVideo,
		RefreshCw,
		SquarePen
	} from 'lucide-svelte';
	import ExternalLinkButton from '$lib/components/ExternalLinkButton.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import WorkflowJobPoller from '$lib/components/WorkflowJobPoller.svelte';
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let copiedVideoId = $state<string | null>(null);
	let loadedTitleAiChecksByVideoId = $state<Record<string, VideoValidation[]> | null>(null);
	let loadedTitleAiChecksError = $state<string | null | undefined>(undefined);
	let titleAiChecksByVideoId = $derived.by(
		(): Record<string, VideoValidation[]> =>
			loadedTitleAiChecksByVideoId ?? data.titleAiChecksByVideoId
	);
	let titleAiChecksError = $derived(loadedTitleAiChecksError ?? data.titleAiChecksError);
	let titleAiChecksLoading = $state(false);
	let updatingVideoType = $state<string | null>(null);
	let syncingPlaylist = $state(false);

	onMount(() => {
		void loadTitleAiChecks();
	});

	function assignmentRowFor(videoId: string) {
		return data.playlistAssignments.find((row) => row.video.youtubeVideoId === videoId);
	}

	function videoRecordId(videoId: string) {
		return assignmentRowFor(videoId)?.video._id;
	}

	function videoStatusKey(videoId: string) {
		return videoRecordId(videoId) ?? videoId;
	}

	function videoDetailHref(videoId: string) {
		return `/videos/${videoRecordId(videoId) ?? videoId}`;
	}

	function titleFocusSpeakers(videoId: string) {
		const row = assignmentRowFor(videoId);

		return (
			row?.speakers.map((speakerRow) => ({
				name: speakerRow.speaker.name,
				company: speakerRow.speaker.company
			})) ?? []
		);
	}

	function videoTitleRecord(videoId: string) {
		const row = assignmentRowFor(videoId);

		if (!row) return null;

		const speaker = row.speakers.map((speakerRow) => speakerRow.speaker.name).join(', ');
		const company = [
			...new Set(
				row.speakers
					.map((speakerRow) => speakerRow.speaker.company)
					.filter((value): value is string => Boolean(value))
			)
		].join(', ');
		const position = [
			...new Set(
				row.speakers
					.map((speakerRow) => speakerRow.speaker.position)
					.filter((value): value is string => Boolean(value))
			)
		].join(', ');

		return {
			speaker: speaker || undefined,
			company: company || undefined,
			position: position || undefined,
			titleOverride: row.video.titleOverride,
			videoTitleFormat: row.video.videoTitleFormat,
			videoType: row.video.videoType
		};
	}

	function videoTypeValue(videoId: string) {
		return normalizeVideoType(videoTitleRecord(videoId)?.videoType);
	}

	function formattedTitle(videoId: string, videoTitle: string) {
		const video = videoTitleRecord(videoId);

		if (video) {
			const baseTitle = deriveComposedBaseTitle(videoTitle, video, data.event);

			return formatComposedVideoTitle(baseTitle, video, data.event);
		}

		const baseTitle = deriveBaseTitle(videoTitle, data.event.titleFormat, data.event);
		return formatVideoTitle(data.event.titleFormat, baseTitle, data.event);
	}

	function eventDisplayTitle() {
		return data.event.editionTitle
			? `${data.event.name}: ${data.event.editionTitle}`
			: data.event.name;
	}

	function baselineValidations(videoId: string, videoTitle: string) {
		const video = videoTitleRecord(videoId);

		return validateVideoBaseline(videoTitle, data.event, {
			speakers: titleFocusSpeakers(videoId),
			...(video ? { video } : {}),
			disabledTitleValidationIds: assignmentRowFor(videoId)?.video.disabledTitleValidationIds
		});
	}

	function titleAiChecksForVideo(videoId: string) {
		return filterDisabledTitleValidations(
			titleAiChecksByVideoId[videoId] ?? [],
			assignmentRowFor(videoId)?.video.disabledTitleValidationIds
		);
	}

	function validationsForVideo(videoId: string, videoTitle: string) {
		return [...baselineValidations(videoId, videoTitle), ...titleAiChecksForVideo(videoId)];
	}

	function validationMatchesFilter(validations: VideoValidation[]) {
		const filter = data.validationFilter;

		if (!filter) return true;

		const validation = validations.find((candidate) => candidate.id === filter.id);
		if (!validation) return false;

		return filter.status ? validation.status === filter.status : true;
	}

	function filteredVideos() {
		if (!data.playlist) return [];

		return data.playlist.videos.filter((video) =>
			validationMatchesFilter(validationsForVideo(video.videoId, video.title))
		);
	}

	function activeValidationLabel() {
		const filter = data.validationFilter;

		if (!filter || !data.playlist) return '';

		const firstMatch = data.playlist.videos
			.flatMap((video) => validationsForVideo(video.videoId, video.title))
			.find((validation) => validation.id === filter.id);

		return firstMatch?.label ?? filter.id;
	}

	function filterStatusLabel() {
		const status = data.validationFilter?.status;

		if (status === 'fail') return 'failing';
		if (status === 'pass') return 'passing';
		if (status === 'info') return 'informational';
		if (status === 'pending') return 'pending';
		return 'matching';
	}

	function clearValidationFilterHref() {
		return resolve('/events/[id]/playlist', { id: data.event._id });
	}

	function titleFocusParts(videoId: string, title: string) {
		const hook = getTitleHookParts(
			title,
			data.event,
			videoTitleRecord(videoId) ?? undefined,
			youtubeTitleFocusLength
		).focus;

		return {
			focus: title.slice(0, hook.length),
			rest: title.slice(hook.length)
		};
	}

	function baselineSummary() {
		if (!data.playlist) {
			return { passing: 0, total: 0 };
		}

		const checks = data.playlist.videos.flatMap((video) =>
			baselineValidations(video.videoId, video.title)
		);
		const actionableChecks = checks.filter((check) => check.status !== 'info');

		return {
			passing: actionableChecks.filter((check) => check.status === 'pass').length,
			total: actionableChecks.length
		};
	}

	function titleAiChecksSummary() {
		if (!data.playlist) {
			return { checked: 0, total: 0 };
		}

		return {
			checked: data.playlist.videos.reduce(
				(total, video) =>
					total +
					(titleAiChecksByVideoId[video.videoId]?.filter(
						(validation) => validation.status !== 'pending'
					).length ?? 0),
				0
			),
			total: data.playlist.videos.length * 2
		};
	}

	function validationClass(status: VideoValidation['status']) {
		return {
			pass: 'border-green-200 bg-green-50 text-green-700',
			fail: 'border-amber-200 bg-amber-50 text-amber-800',
			info: 'border-gray-200 bg-gray-50 text-gray-600',
			pending: 'border-slate-200 bg-slate-50 text-slate-600'
		}[status];
	}

	function submitParentForm(event: Event) {
		const select = event.currentTarget;

		if (select instanceof HTMLSelectElement) {
			select.form?.requestSubmit();
		}
	}

	function afterVideoTypeUpdate(videoId: string) {
		return () => {
			updatingVideoType = videoId;

			return async ({ update }: { update: () => Promise<void> }) => {
				try {
					await update();
				} finally {
					updatingVideoType = null;
				}
			};
		};
	}

	function afterPlaylistSync() {
		syncingPlaylist = true;

		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				syncingPlaylist = false;
			}
		};
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

	async function loadTitleAiChecks() {
		const playlist = data.playlist;

		if (!playlist?.videos.length) {
			return;
		}

		titleAiChecksLoading = true;
		loadedTitleAiChecksError = null;

		try {
			const response = await fetch(`/events/${data.event._id}/playlist/title-ai-checks`, {
				method: 'POST'
			});
			const body = (await response.json().catch(() => ({}))) as {
				validationsByVideoId?: Record<string, VideoValidation[]>;
				error?: string | null;
			};

			loadedTitleAiChecksByVideoId = body.validationsByVideoId ?? {};
			loadedTitleAiChecksError =
				body.error ?? (response.ok ? null : `AI title validation failed with ${response.status}.`);
		} catch {
			loadedTitleAiChecksError = 'AI title validation is temporarily unavailable.';
		} finally {
			titleAiChecksLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{eventDisplayTitle()} Playlist</title>
</svelte:head>

<main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
	<WorkflowJobPoller jobs={[data.syncJob]} />

	<PageHeader
		backHref="/events"
		backLabel="Events"
		title={eventDisplayTitle()}
		subtitle={`${data.event.year} · ${normalizeTitleFormat(data.event.titleFormat)}`}
	/>

	{#if !data.event.youtubePlaylistId}
		<section class="rounded-lg border border-amber-200 bg-amber-50 p-5">
			<h2 class="text-lg font-semibold text-amber-950">No playlist linked</h2>
			<p class="mt-1 text-sm text-amber-800">
				Add a YouTube playlist URL or ID to this event before inspecting videos.
			</p>
		</section>
	{:else if data.playlist}
		{@const summary = baselineSummary()}
		{@const aiCheckSummary = titleAiChecksSummary()}
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
							Static title checks: {summary.passing}/{summary.total} passing
						</p>
					{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					<ExternalLinkButton
						href={data.playlist.url}
						icon={CirclePlay}
						label="Open playlist"
						labelVisible
					/>
					<ExternalLinkButton
						href={data.playlist.studioContentUrl}
						icon={ListVideo}
						label="Studio content"
						labelVisible
					/>
					<ExternalLinkButton
						href={data.playlist.studioEditUrl}
						icon={SquarePen}
						label="Studio edit"
						labelVisible
					/>
					<form method="POST" action="?/syncPlaylist" use:enhance={afterPlaylistSync}>
						<IconButton
							type="submit"
							icon={RefreshCw}
							label={syncingPlaylist ? 'Syncing' : 'Sync playlist'}
							labelVisible
							tone="primary"
							disabled={syncingPlaylist}
						/>
					</form>
				</div>
			</div>
			{#if form?.playlistSyncError}
				<p
					class="mt-3 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700"
				>
					{form.playlistSyncError}
				</p>
			{:else if data.syncJob?.status === 'queued' || data.syncJob?.status === 'running'}
				<p class="mt-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
					Playlist sync {data.syncJob.status}.
				</p>
			{:else if data.syncJob?.status === 'error'}
				<p
					class="mt-3 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700"
				>
					Last playlist sync failed: {data.syncJob.error}
				</p>
			{:else if data.syncJob?.status === 'complete'}
				<p
					class="mt-3 rounded border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700"
				>
					Playlist sync complete.
				</p>
			{:else if form?.playlistSyncMessage}
				<p
					class="mt-3 rounded border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700"
				>
					{form.playlistSyncMessage}
				</p>
			{/if}
			<div class="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
				<p class="text-xs font-medium text-gray-500 uppercase">Title preview</p>
				<p class="mt-1 text-sm text-gray-700">
					{previewVideoTitle(
						normalizeTitleFormat(data.event.titleFormat),
						data.event.name,
						data.event.year ?? new Date().getFullYear(),
						data.event.editionTitle
					)}
				</p>
				<p class="mt-1 text-xs text-gray-500">
					The hook uses the title segment before formatting, capped at {youtubeTitleFocusLength}
					characters.
				</p>
				{#if titleAiChecksLoading}
					<p class="mt-1 text-xs text-gray-500">Checking AI title validations...</p>
				{:else if titleAiChecksError}
					<p class="mt-1 text-xs text-amber-700">{titleAiChecksError}</p>
				{:else}
					<p class="mt-1 text-xs text-gray-500">
						AI title checks: {aiCheckSummary.checked}/{aiCheckSummary.total}
					</p>
				{/if}
				{#if form?.videoTypeError}
					<p class="mt-1 text-xs text-amber-700">{form.videoTypeError}</p>
				{/if}
			</div>
		</section>

		<section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
			{#if data.validationFilter}
				<div
					class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-blue-50 px-4 py-3"
				>
					<p class="text-sm font-medium text-blue-950">
						Showing {filterStatusLabel()}
						{activeValidationLabel()} videos
					</p>
					<a
						href={clearValidationFilterHref()}
						class="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline"
					>
						Clear filter
					</a>
				</div>
			{/if}
			<div
				class="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500 uppercase md:grid-cols-[84px_124px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_220px]"
			>
				<div>Video</div>
				<div class="hidden md:block">Type</div>
				<div>Current</div>
				<div class="hidden md:block">Validation</div>
				<div class="hidden md:block">Formatted</div>
				<div class="hidden md:block">Actions</div>
			</div>

			{#each filteredVideos() as video (video.playlistItemId)}
				{@const nextTitle = formattedTitle(video.videoId, video.title)}
				{@const validations = validationsForVideo(video.videoId, video.title)}
				{@const currentTitleParts = titleFocusParts(video.videoId, video.title)}
				{@const formattedTitleParts = titleFocusParts(video.videoId, nextTitle)}
				{@const recordId = videoRecordId(video.videoId)}
				{@const statusKey = videoStatusKey(video.videoId)}
				<article
					class="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0 md:grid-cols-[84px_124px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_220px]"
				>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
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
					<form
						method="POST"
						action="?/updateVideoType"
						use:enhance={afterVideoTypeUpdate(statusKey)}
						class="hidden md:block"
					>
						<input type="hidden" name="videoId" value={recordId ?? ''} />
						<label class="sr-only" for={`videoType-desktop-${video.videoId}`}>Video type</label>
						<select
							id={`videoType-desktop-${video.videoId}`}
							name="videoType"
							value={videoTypeValue(video.videoId)}
							onchange={submitParentForm}
							disabled={!recordId || updatingVideoType === statusKey}
							class="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm disabled:cursor-wait disabled:opacity-60"
						>
							{#each videoTypeOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<button type="submit" class="sr-only">Save video type</button>
						{#if updatingVideoType === statusKey}
							<p class="mt-1 text-xs text-gray-500">Saving...</p>
						{:else if form?.videoTypeVideoId === recordId && form?.videoTypeMessage}
							<p class="mt-1 text-xs text-green-700">{form?.videoTypeMessage}</p>
						{/if}
						{#if videoTitleRecord(video.videoId)?.titleOverride}
							<p class="mt-1 text-xs text-gray-500">Override</p>
						{/if}
					</form>
					<div class="min-w-0">
						<p class="flex flex-wrap items-center gap-2 text-xs text-gray-400">
							#{video.position + 1} · {formatDate(video.videoPublishedAt)}
						</p>
						<h3 class="mt-1 text-sm font-medium text-gray-950">
							<span class="rounded bg-blue-50 px-0.5 text-blue-950">{currentTitleParts.focus}</span
							><span class="text-gray-500">{currentTitleParts.rest}</span>
						</h3>
						<p class="mt-1 text-xs break-all text-gray-500">{video.videoId}</p>
						<form
							method="POST"
							action="?/updateVideoType"
							use:enhance={afterVideoTypeUpdate(statusKey)}
							class="mt-3 md:hidden"
						>
							<input type="hidden" name="videoId" value={recordId ?? ''} />
							<label class="sr-only" for={`videoType-mobile-${video.videoId}`}>Video type</label>
							<select
								id={`videoType-mobile-${video.videoId}`}
								name="videoType"
								value={videoTypeValue(video.videoId)}
								onchange={submitParentForm}
								disabled={!recordId || updatingVideoType === statusKey}
								class="max-w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm disabled:cursor-wait disabled:opacity-60"
							>
								{#each videoTypeOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
							<button type="submit" class="sr-only">Save video type</button>
							{#if updatingVideoType === statusKey}
								<p class="mt-1 text-xs text-gray-500">Saving...</p>
							{:else if form?.videoTypeVideoId === recordId && form?.videoTypeMessage}
								<p class="mt-1 text-xs text-green-700">{form?.videoTypeMessage}</p>
							{/if}
							{#if videoTitleRecord(video.videoId)?.titleOverride}
								<p class="mt-1 text-xs text-gray-500">Override</p>
							{/if}
						</form>
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
							<IconButton
								href={videoDetailHref(video.videoId)}
								icon={FileText}
								label="Video details"
							/>
							<ExternalLinkButton
								href={video.playlistVideoUrl}
								icon={CirclePlay}
								label="Watch on YouTube"
							/>
							<ExternalLinkButton
								href={video.studioEditUrl}
								icon={SquarePen}
								label="Open in YouTube Studio"
							/>
							<IconButton
								icon={copiedVideoId === video.videoId ? Check : ClipboardCopy}
								label={copiedVideoId === video.videoId ? 'Copied title' : 'Copy formatted title'}
								onclick={() => copyTitle(video.videoId, nextTitle)}
								tone="primary"
							/>
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
						<IconButton
							href={videoDetailHref(video.videoId)}
							icon={FileText}
							label="Video details"
						/>
						<ExternalLinkButton
							href={video.playlistVideoUrl}
							icon={CirclePlay}
							label="Watch on YouTube"
						/>
						<ExternalLinkButton
							href={video.studioEditUrl}
							icon={SquarePen}
							label="Open in YouTube Studio"
						/>
						<IconButton
							icon={copiedVideoId === video.videoId ? Check : ClipboardCopy}
							label={copiedVideoId === video.videoId ? 'Copied title' : 'Copy formatted title'}
							onclick={() => copyTitle(video.videoId, nextTitle)}
							tone="primary"
						/>
					</div>
				</article>
			{:else}
				<p class="px-4 py-8 text-sm text-gray-500">
					{data.validationFilter
						? 'No videos match this validation filter.'
						: 'No public videos found in this playlist.'}
				</p>
			{/each}
		</section>
	{:else}
		<section class="rounded-lg border border-gray-200 bg-white p-5">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="text-lg font-semibold text-gray-950">No synced playlist data</h2>
					<p class="mt-1 text-sm text-gray-500">Queue a playlist sync to build the video list.</p>
					{#if data.syncJob?.status === 'queued' || data.syncJob?.status === 'running'}
						<p class="mt-2 text-sm text-blue-700">Playlist sync {data.syncJob.status}.</p>
					{:else if data.syncJob?.status === 'error'}
						<p class="mt-2 text-sm text-amber-700">Last sync failed: {data.syncJob.error}</p>
					{/if}
				</div>
				<form method="POST" action="?/syncPlaylist" use:enhance={afterPlaylistSync}>
					<IconButton
						type="submit"
						icon={RefreshCw}
						label={syncingPlaylist ? 'Syncing' : 'Sync playlist'}
						labelVisible
						tone="primary"
						disabled={syncingPlaylist}
					/>
				</form>
			</div>
			{#if form?.playlistSyncError}
				<p
					class="mt-3 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700"
				>
					{form.playlistSyncError}
				</p>
			{:else if data.syncJob?.status === 'queued' || data.syncJob?.status === 'running'}
				<p class="mt-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
					Playlist sync {data.syncJob.status}.
				</p>
			{:else if data.syncJob?.status === 'error'}
				<p
					class="mt-3 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700"
				>
					Last playlist sync failed: {data.syncJob.error}
				</p>
			{:else if data.syncJob?.status === 'complete'}
				<p
					class="mt-3 rounded border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700"
				>
					Playlist sync complete.
				</p>
			{:else if form?.playlistSyncMessage}
				<p
					class="mt-3 rounded border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700"
				>
					{form.playlistSyncMessage}
				</p>
			{/if}
		</section>
	{/if}
</main>
