<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		canCustomizeVideoTitleFormat,
		deriveComposedBaseTitle,
		formatComposedVideoTitle,
		getDefaultVideoTypeTitleFormat,
		normalizeComposedVideoTitleFormat,
		normalizeTitleOverride,
		normalizeVideoType,
		videoTypeLabelFor,
		videoTypeOptions,
		videoTitleTokens
	} from '$lib/title-format';
	import { youtubePlaylistUrl } from '$lib/youtube';
	import {
		validateVideoBaseline,
		youtubeTitleMaxLength,
		type VideoValidation
	} from '$lib/video-validation';
	import { CirclePlay, ListVideo, SquarePen } from 'lucide-svelte';
	import ExternalLinkButton from '$lib/components/ExternalLinkButton.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';

	type AssignmentTitleAlternatives = {
		assignmentId: string;
		alternatives: string[];
		error: string | null;
	};

	type GeneratedDescription = {
		hook: string;
		metadata: Array<{ label: string; value: string }>;
		chapters: Array<{ timestamp: string; title: string }>;
		links: Array<{ label: string; url?: string; placeholder?: string }>;
		description: string;
		model: string;
		chapterTarget: number;
		durationSeconds: number;
	};

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let titleQualityValidations = $state<VideoValidation[]>([]);
	let titleQualityError = $state<string | null>(null);
	let titleQualityLoading = $state(false);
	let titleAlternativesByAssignmentId = $state<Record<string, AssignmentTitleAlternatives>>({});
	let titleAlternativesError = $state<string | null>(null);
	let titleAlternativesLoading = $state(false);
	let copiedTitle = $state<string | null>(null);
	let generatedDescription = $state<GeneratedDescription | null>(null);
	let descriptionError = $state<string | null>(null);
	let descriptionLoading = $state(false);
	let copiedDescription = $state(false);
	let metadataSaved = $state(false);
	let captionsFetching = $state(false);
	let applyingTitle = $state<string | null>(null);
	let selectedVideoType = $state(currentVideoType());
	let videoTitleFormatInput = $state(currentVideoTitleFormat());
	let titleOverrideEnabled = $state(Boolean(currentTitleOverride()));
	let titleOverrideInput = $state(currentTitleOverride());
	let speakerSelection = $state('');
	let selectedSpeakerId = $state('');
	let speakerName = $state('');
	let speakerPosition = $state('');
	let speakerCompany = $state('');

	$effect(() => {
		selectedVideoType = currentVideoType();
		videoTitleFormatInput = currentVideoTitleFormat();
		titleOverrideEnabled = Boolean(currentTitleOverride());
		titleOverrideInput = currentTitleOverride();
	});

	function currentVideoType() {
		return normalizeVideoType(data.videoView.video.videoType);
	}

	function currentVideoTitleFormat() {
		return data.videoView.video.videoTitleFormat ?? '';
	}

	function currentTitleOverride() {
		return data.videoView.video.titleOverride ?? '';
	}

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
			info: 'border-gray-200 bg-gray-50 text-gray-600',
			pending: 'border-slate-200 bg-slate-50 text-slate-600'
		}[status];
	}

	function titleFocusSpeakers() {
		return data.videoView.speakers.map((row) => ({
			name: row.speaker.name,
			company: row.speaker.company
		}));
	}

	function assignmentAlternatives(assignmentId: string) {
		return titleAlternativesByAssignmentId[assignmentId];
	}

	function canApplyTitle(title: string) {
		const trimmedTitle = title.trim();

		return (
			trimmedTitle.length > 0 &&
			trimmedTitle.length <= youtubeTitleMaxLength &&
			trimmedTitle !== data.videoView.video.title
		);
	}

	function titleApplyLabel(title: string) {
		const trimmedTitle = title.trim();

		if (applyingTitle === title) return 'Updating...';
		if (trimmedTitle === data.videoView.video.title) return 'Current title';
		if (trimmedTitle.length > youtubeTitleMaxLength) return 'Too long';

		return 'Update YouTube';
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
			titleOverride: selectedTitleOverride(),
			videoTitleFormat: selectedVideoTitleFormat(),
			videoType: selectedVideoType
		};
	}

	function selectedVideoTitleFormat() {
		return canCustomizeVideoTitleFormat(selectedVideoType)
			? videoTitleFormatInput
			: data.videoView.video.videoTitleFormat;
	}

	function selectedTitleOverride() {
		return titleOverrideEnabled ? titleOverrideInput : undefined;
	}

	function titleOverrideLength() {
		return (
			normalizeTitleOverride(selectedTitleOverride())?.length ?? titleOverrideInput.trim().length
		);
	}

	function assignmentTitleValidations(
		event: PageData['videoView']['assignments'][number]['event']
	) {
		return validateVideoBaseline(data.videoView.video.title, event, {
			speakers: titleFocusSpeakers(),
			video: videoTitleRecord()
		});
	}

	function speakerMeta(row: PageData['videoView']['speakers'][number]) {
		return [row.speaker.position, row.speaker.company].filter(Boolean).join(', ');
	}

	function eventDisplayTitle(event: PageData['videoView']['assignments'][number]['event']) {
		return event.editionTitle ? `${event.name}: ${event.editionTitle}` : event.name;
	}

	function availableSpeakerLabel(speaker: PageData['availableSpeakers'][number]) {
		const meta = [speaker.position, speaker.company].filter(Boolean).join(', ');

		return meta ? `${speaker.name} (${meta})` : speaker.name;
	}

	function findAvailableSpeaker(value: string) {
		const selection = value.trim();

		return data.availableSpeakers.find((speaker) => availableSpeakerLabel(speaker) === selection);
	}

	function syncSpeakerSelection() {
		const wasSelected = Boolean(selectedSpeakerId);
		const speaker = findAvailableSpeaker(speakerSelection);

		if (!speaker) {
			selectedSpeakerId = '';
			speakerName = speakerSelection;

			if (wasSelected) {
				speakerPosition = '';
				speakerCompany = '';
			}

			return;
		}

		selectedSpeakerId = speaker._id;
		speakerName = speaker.name;
		speakerPosition = speaker.position ?? '';
		speakerCompany = speaker.company ?? '';
	}

	function addSpeakerName() {
		return selectedSpeakerId ? speakerName : speakerSelection.trim();
	}

	function afterSpeakerAdd() {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			speakerSelection = '';
			selectedSpeakerId = '';
			speakerName = '';
			speakerPosition = '';
			speakerCompany = '';
		};
	}

	function composedTitle(event: PageData['videoView']['assignments'][number]['event']) {
		const video = videoTitleRecord();
		const baseTitle = deriveComposedBaseTitle(data.videoView.video.title, video, event);

		return formatComposedVideoTitle(baseTitle, video, event);
	}

	function afterMetadataUpdate() {
		return async ({
			update,
			result
		}: {
			update: () => Promise<void>;
			result: { type: string };
		}) => {
			await update();
			if (result.type !== 'success') {
				metadataSaved = false;
				return;
			}

			await loadTitleQuality();
			titleAlternativesByAssignmentId = {};
			metadataSaved = true;

			setTimeout(() => {
				metadataSaved = false;
			}, 1600);
		};
	}

	function afterCaptionFetch() {
		return async ({ update }: { update: () => Promise<void> }) => {
			captionsFetching = true;
			await update();
			captionsFetching = false;
		};
	}

	function afterTitleApply(title: string) {
		return () => {
			applyingTitle = title;

			return async ({ update }: { update: () => Promise<void> }) => {
				try {
					await update();
					await loadTitleQuality();
				} finally {
					applyingTitle = null;
				}
			};
		};
	}

	function srtToPlainText(body: string) {
		return body
			.replace(/\r/g, '')
			.split('\n')
			.filter((line) => {
				const trimmed = line.trim();

				return (
					trimmed.length > 0 &&
					!/^\d+$/.test(trimmed) &&
					!/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(trimmed)
				);
			})
			.join('\n');
	}

	function downloadCaption(filename: string, body: string, type = 'text/plain;charset=utf-8') {
		const url = URL.createObjectURL(new Blob([body], { type }));
		const link = document.createElement('a');

		link.href = url;
		link.download = filename;
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}

	async function copyTitle(title: string) {
		await navigator.clipboard.writeText(title);
		copiedTitle = title;

		setTimeout(() => {
			if (copiedTitle === title) copiedTitle = null;
		}, 1600);
	}

	async function copyDescription(description: string) {
		await navigator.clipboard.writeText(description);
		copiedDescription = true;

		setTimeout(() => {
			copiedDescription = false;
		}, 1600);
	}

	async function loadTitleQuality() {
		titleQualityLoading = true;
		titleQualityError = null;

		try {
			const response = await fetch(
				`/videos/${encodeURIComponent(data.videoView.video._id)}/title-quality`,
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
				body.error ?? (response.ok ? null : `AI title validation failed with ${response.status}.`);
		} catch {
			titleQualityError = 'AI title validation is temporarily unavailable.';
		} finally {
			titleQualityLoading = false;
		}
	}

	async function loadTitleAlternatives() {
		titleAlternativesLoading = true;
		titleAlternativesError = null;

		try {
			const response = await fetch(
				`/videos/${encodeURIComponent(data.videoView.video._id)}/title-alternatives`,
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

	async function loadGeneratedDescription() {
		descriptionLoading = true;
		descriptionError = null;
		generatedDescription = null;

		try {
			const response = await fetch(
				`/videos/${encodeURIComponent(data.videoView.video._id)}/description`,
				{
					method: 'POST'
				}
			);
			const body = (await response.json().catch(() => ({}))) as {
				description?: GeneratedDescription | null;
				error?: string | null;
			};

			generatedDescription = body.description ?? null;
			descriptionError =
				body.error ??
				(response.ok ? null : `Description generation failed with ${response.status}.`);
		} catch {
			descriptionError = 'Description generation is temporarily unavailable.';
		} finally {
			descriptionLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{data.videoView.video.title}</title>
</svelte:head>

<main class="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
	<PageHeader
		backHref="/events"
		backLabel="Events"
		title={data.videoView.video.title}
		subtitle={data.videoView.video.youtubeVideoId}
	>
		<div class="flex flex-wrap gap-2">
			<ExternalLinkButton
				href={data.videoView.video.videoUrl}
				icon={CirclePlay}
				label="Watch on YouTube"
				labelVisible
				size="md"
			/>
			<ExternalLinkButton
				href={data.videoView.video.studioEditUrl}
				icon={SquarePen}
				label="Open in Studio"
				labelVisible
				size="md"
				tone="primary"
			/>
		</div>
	</PageHeader>

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
			{#if data.refreshError}
				<p
					class="mt-3 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700"
				>
					YouTube refresh failed: {data.refreshError}
				</p>
			{/if}
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
			<div class="mb-4">
				<label for="videoType" class="mb-1 block text-sm text-gray-500">Video type</label>
				<select
					id="videoType"
					name="videoType"
					bind:value={selectedVideoType}
					class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
				>
					{#each videoTypeOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
			{#if canCustomizeVideoTitleFormat(selectedVideoType)}
				<div>
					<label for="videoTitleFormat" class="mb-1 block text-sm text-gray-500"
						>Custom title format</label
					>
					<input
						id="videoTitleFormat"
						name="videoTitleFormat"
						bind:value={videoTitleFormatInput}
						placeholder={getDefaultVideoTypeTitleFormat(selectedVideoType)}
						class="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
					/>
					<div class="mt-1 flex flex-wrap gap-1">
						{#each videoTitleTokens as token (token)}
							<span class="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
								{token}
							</span>
						{/each}
					</div>
					<p class="mt-2 text-xs text-gray-500">
						Fallback:
						<span class="font-mono">{getDefaultVideoTypeTitleFormat(selectedVideoType)}</span>
					</p>
				</div>
			{:else}
				<div class="rounded border border-gray-200 bg-gray-50 px-3 py-2">
					<p class="text-xs text-gray-500">
						{videoTypeLabelFor(selectedVideoType)} format
					</p>
					<p class="mt-1 font-mono text-sm text-gray-800">
						{getDefaultVideoTypeTitleFormat(selectedVideoType)}
					</p>
				</div>
			{/if}
			<div class="mt-4 rounded border border-gray-200 bg-gray-50 px-3 py-3">
				<label class="flex items-center gap-2 text-sm font-medium text-gray-900">
					<input
						type="checkbox"
						name="titleOverrideEnabled"
						bind:checked={titleOverrideEnabled}
						class="h-4 w-4 rounded border-gray-300 text-gray-950"
					/>
					Title override
				</label>
				{#if titleOverrideEnabled}
					<div class="mt-3">
						<label for="titleOverride" class="sr-only">Override title</label>
						<textarea
							id="titleOverride"
							name="titleOverride"
							bind:value={titleOverrideInput}
							maxlength={youtubeTitleMaxLength}
							rows="2"
							placeholder={data.videoView.video.title}
							class="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
						></textarea>
						<p class="mt-1 text-xs text-gray-500">
							{titleOverrideLength()}/{youtubeTitleMaxLength}
						</p>
					</div>
				{/if}
			</div>
			<div class="mt-4 flex flex-wrap items-center gap-3">
				<button
					type="submit"
					class="rounded bg-gray-950 px-3 py-2 text-sm text-white hover:bg-gray-800"
				>
					{normalizeTitleOverride(selectedTitleOverride())
						? 'Save and Update YouTube'
						: 'Save Metadata'}
				</button>
				{#if form?.metadataError}
					<span class="text-sm text-amber-700">{form.metadataError}</span>
				{:else if metadataSaved}
					<span class="text-sm text-green-700">{form?.metadataMessage ?? 'Saved'}</span>
				{/if}
			</div>
			{#if normalizeTitleOverride(selectedTitleOverride())}
				<p class="mt-3 text-xs text-gray-500">
					Effective title:
					<span class="font-mono">{normalizeTitleOverride(selectedTitleOverride())}</span>
				</p>
			{:else}
				<p class="mt-3 text-xs text-gray-500">
					Effective format:
					<span class="font-mono"
						>{normalizeComposedVideoTitleFormat(
							selectedVideoTitleFormat(),
							selectedVideoType
						)}</span
					>
				</p>
			{/if}
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
				use:enhance={afterSpeakerAdd}
				class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
			>
				<div>
					<label for="speakerName" class="mb-1 block text-sm text-gray-500">Speaker</label>
					<input
						id="speakerName"
						list="availableSpeakers"
						bind:value={speakerSelection}
						oninput={syncSpeakerSelection}
						onchange={syncSpeakerSelection}
						placeholder="Search speakers or type a new one"
						autocomplete="off"
						class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
					<datalist id="availableSpeakers">
						{#each data.availableSpeakers as speaker (speaker._id)}
							<option value={availableSpeakerLabel(speaker)}></option>
						{/each}
					</datalist>
					<input type="hidden" name="speakerId" value={selectedSpeakerId} />
					<input type="hidden" name="name" value={addSpeakerName()} />
					{#if selectedSpeakerId}
						<p class="mt-1 text-xs text-gray-500">Existing speaker selected</p>
					{/if}
				</div>
				<div>
					<label for="speakerPosition" class="mb-1 block text-sm text-gray-500">Position</label>
					<input
						id="speakerPosition"
						name="position"
						bind:value={speakerPosition}
						readonly={Boolean(selectedSpeakerId)}
						class="w-full rounded border border-gray-300 px-3 py-2 text-sm read-only:bg-gray-50 read-only:text-gray-500"
					/>
				</div>
				<div>
					<label for="speakerCompany" class="mb-1 block text-sm text-gray-500">Company</label>
					<input
						id="speakerCompany"
						name="company"
						bind:value={speakerCompany}
						readonly={Boolean(selectedSpeakerId)}
						class="w-full rounded border border-gray-300 px-3 py-2 text-sm read-only:bg-gray-50 read-only:text-gray-500"
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
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3"
		>
			<div>
				<h2 class="text-sm font-semibold text-gray-950">Description</h2>
				<p class="mt-1 text-xs text-gray-500">Generate from stored SRT captions</p>
			</div>
			<button
				type="button"
				onclick={loadGeneratedDescription}
				disabled={descriptionLoading || data.captions.length === 0}
				class="rounded bg-gray-950 px-2.5 py-1.5 text-xs text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
			>
				{descriptionLoading ? 'Generating...' : 'Generate Description'}
			</button>
		</div>
		<div class="px-4 py-4">
			{#if data.videoView.video.description}
				<p class="text-sm break-words whitespace-pre-wrap text-gray-700">
					{data.videoView.video.description}
				</p>
			{:else}
				<p class="text-sm text-gray-500">No description synced yet.</p>
			{/if}
			{#if data.captions.length === 0}
				<p class="mt-3 text-xs text-amber-700">
					Fetch captions before generating a structured description.
				</p>
			{/if}
			{#if descriptionError}
				<p
					class="mt-4 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700"
				>
					{descriptionError}
				</p>
			{/if}
			{#if generatedDescription}
				<div class="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="text-xs font-medium text-gray-500 uppercase">Generated Description</p>
							<p class="mt-1 text-sm text-gray-500">
								{generatedDescription.model} · {generatedDescription.description.length.toLocaleString()}
								chars
							</p>
							<p class="mt-1 text-xs text-gray-500">
								{Math.round(generatedDescription.durationSeconds / 60)} min · {generatedDescription
									.chapters.length}/{generatedDescription.chapterTarget} chapters
							</p>
						</div>
						<button
							type="button"
							onclick={() => copyDescription(generatedDescription!.description)}
							class="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
						>
							{copiedDescription ? 'Copied' : 'Copy Description'}
						</button>
					</div>
					<p class="mt-3 rounded border border-blue-100 bg-blue-50 px-2 py-1 text-sm text-blue-950">
						{generatedDescription.hook}
					</p>
					<div class="mt-3 grid gap-3 md:grid-cols-2">
						{#if generatedDescription.metadata.length}
							<div>
								<p class="text-xs font-medium text-gray-500 uppercase">Metadata</p>
								<dl class="mt-2 space-y-1 text-sm">
									{#each generatedDescription.metadata as item (`${item.label}-${item.value}`)}
										<div>
											<dt class="text-xs text-gray-500">{item.label}</dt>
											<dd class="text-gray-800">{item.value}</dd>
										</div>
									{/each}
								</dl>
							</div>
						{/if}
						{#if generatedDescription.chapters.length}
							<div>
								<p class="text-xs font-medium text-gray-500 uppercase">Chapters</p>
								<div class="mt-2 space-y-1 text-sm">
									{#each generatedDescription.chapters as chapter (`${chapter.timestamp}-${chapter.title}`)}
										<p class="text-gray-800">
											<span class="font-mono text-gray-500">{chapter.timestamp}</span>
											{chapter.title}
										</p>
									{/each}
								</div>
							</div>
						{/if}
					</div>
					{#if generatedDescription.links.length}
						<div class="mt-3">
							<p class="text-xs font-medium text-gray-500 uppercase">Links</p>
							<div class="mt-2 space-y-1 text-sm">
								{#each generatedDescription.links as link (`${link.label}-${link.url ?? link.placeholder}`)}
									<p class="text-gray-800">
										{link.label}: <span class="text-gray-500">{link.url ?? link.placeholder}</span>
									</p>
								{/each}
							</div>
						</div>
					{/if}
					<details class="mt-3">
						<summary class="cursor-pointer text-xs text-gray-600">Full generated text</summary>
						<pre
							class="mt-2 max-h-96 overflow-auto rounded border border-gray-200 bg-white p-3 text-xs whitespace-pre-wrap text-gray-700">{generatedDescription.description}</pre>
					</details>
				</div>
			{/if}
		</div>
	</section>

	<section class="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3"
		>
			<div>
				<h2 class="text-sm font-semibold text-gray-950">Captions</h2>
				<p class="mt-1 text-xs text-gray-500">{data.captions.length} stored tracks</p>
			</div>
			<form method="POST" action="?/fetchCaptions" use:enhance={afterCaptionFetch}>
				<button
					type="submit"
					disabled={captionsFetching}
					class="rounded bg-gray-950 px-2.5 py-1.5 text-xs text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
				>
					{captionsFetching ? 'Fetching...' : 'Fetch Captions'}
				</button>
			</form>
		</div>
		{#if form?.captionError}
			<p class="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
				{form.captionError}
			</p>
		{:else if form?.captionMessage}
			<p class="border-b border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
				{form.captionMessage}
			</p>
		{/if}
		<div class="px-4 py-4">
			{#if data.captions.length}
				<div class="space-y-4">
					{#each data.captions as caption (caption._id)}
						<div class="rounded border border-gray-200 bg-gray-50 p-3">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p class="text-sm font-medium text-gray-950">
										{caption.language ?? 'Unknown language'}
										{#if caption.name}
											<span class="text-gray-500">· {caption.name}</span>
										{/if}
									</p>
									<p class="mt-1 text-xs text-gray-500">
										{caption.format.toUpperCase()} · {caption.trackKind ?? 'track'} · Fetched
										{formatDate(caption.fetchedAt)}
									</p>
								</div>
								<span
									class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500"
								>
									{caption.body.length.toLocaleString()} chars
								</span>
							</div>
							<div class="mt-3 flex flex-wrap gap-2">
								<button
									type="button"
									onclick={() =>
										downloadCaption(
											`${data.videoView.video.youtubeVideoId}-${caption.language ?? 'captions'}.srt`,
											caption.body,
											'application/x-subrip;charset=utf-8'
										)}
									class="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
								>
									Download SRT
								</button>
								<button
									type="button"
									onclick={() =>
										downloadCaption(
											`${data.videoView.video.youtubeVideoId}-${caption.language ?? 'captions'}.txt`,
											srtToPlainText(caption.body)
										)}
									class="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
								>
									Download TXT
								</button>
							</div>
							<details class="mt-3">
								<summary class="cursor-pointer text-xs text-gray-600">Preview transcript</summary>
								<pre
									class="mt-2 max-h-64 overflow-auto rounded border border-gray-200 bg-white p-3 text-xs whitespace-pre-wrap text-gray-700">{caption.body}</pre>
							</details>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-gray-500">
					No captions stored yet. Fetching captions requires the YouTube metadata write scope.
				</p>
			{/if}
		</div>
	</section>

	<section class="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
		<div class="border-b border-gray-200 bg-gray-50 px-4 py-3">
			<h2 class="text-sm font-semibold text-gray-950">Video Validations</h2>
		</div>
		<div class="px-4 py-4">
			{#if titleQualityLoading}
				<p class="text-sm text-gray-500">Checking AI title validations...</p>
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
				<p class="text-sm text-gray-500">No AI title checks have returned yet.</p>
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
		{#if form?.titleUpdateError}
			<p class="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
				{form.titleUpdateError}
			</p>
		{:else if form?.titleUpdateMessage}
			<p class="border-b border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
				{form.titleUpdateMessage}
			</p>
		{/if}
		{#each data.videoView.assignments as row (row.assignment._id)}
			{@const validations = assignmentTitleValidations(row.event)}
			{@const alternatives = assignmentAlternatives(row.assignment._id)}
			<article
				class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0"
			>
				<div>
					<p class="font-medium text-gray-950">
						{eventDisplayTitle(row.event)} <span class="text-gray-400">({row.event.year})</span>
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
										<form method="POST" action="?/applyTitle" use:enhance={afterTitleApply(title)}>
											<input type="hidden" name="title" value={title} />
											<button
												type="submit"
												disabled={!canApplyTitle(title) || applyingTitle === title}
												class="rounded bg-gray-950 px-2 py-1 text-xs text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
											>
												{titleApplyLabel(title)}
											</button>
										</form>
									</div>
								</div>
							{/each}
						</div>
					{:else if alternatives?.error}
						<p class="mt-3 text-xs text-amber-700">{alternatives.error}</p>
					{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					<IconButton
						href={`/events/${row.event._id}/playlist`}
						icon={ListVideo}
						label="Event playlist"
					/>
					<ExternalLinkButton
						href={youtubePlaylistUrl(row.assignment.playlistId)}
						icon={ListVideo}
						label="Open YouTube playlist"
					/>
					<ExternalLinkButton
						href={row.assignment.playlistVideoUrl}
						icon={CirclePlay}
						label="Watch from playlist"
					/>
				</div>
			</article>
		{:else}
			<p class="px-4 py-8 text-sm text-gray-500">No playlist assignments synced yet.</p>
		{/each}
	</section>
</main>
