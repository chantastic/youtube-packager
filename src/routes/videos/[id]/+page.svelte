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
		filterDisabledTitleValidations,
		validateVideoBaseline,
		youtubeTitleMaxLength,
		type VideoValidation
	} from '$lib/video-validation';
	import { titleCheckDefinitions } from '$lib/title-checks';
	import { CirclePlay, ListVideo, RefreshCw, Save, SquarePen } from 'lucide-svelte';
	import ExternalLinkButton from '$lib/components/ExternalLinkButton.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import WorkflowJobStatus from '$lib/components/WorkflowJobStatus.svelte';
	import WorkflowJobPoller from '$lib/components/WorkflowJobPoller.svelte';
	import { workflowJobIsActive, workflowJobLabel } from '$lib/workflow-job';
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

	type DescriptionJob = NonNullable<PageData['descriptionJob']>;
	type VideoActionData =
		| ActionData
		| {
				refreshError?: string;
				refreshMessage?: string;
				captionError?: string;
				captionMessage?: string;
				metadataError?: string;
				metadataMessage?: string;
				titleUpdateError?: string;
				titleUpdateMessage?: string;
		  };

	let { data, form }: { data: PageData; form: VideoActionData } = $props();
	let titleAiChecks = $state<VideoValidation[]>([]);
	let titleAiChecksError = $state<string | null>(null);
	let titleAiChecksLoading = $state(false);
	let titleAlternativesByAssignmentId = $state<Record<string, AssignmentTitleAlternatives>>({});
	let titleAlternativesError = $state<string | null>(null);
	let titleAlternativesLoading = $state(false);
	let copiedTitle = $state<string | null>(null);
	let descriptionJob = $state<DescriptionJob | null>(currentDescriptionJob());
	let generatedDescription = $state<GeneratedDescription | null>(
		currentDescriptionJob()?.result ?? null
	);
	let descriptionError = $state<string | null>(descriptionJobError(currentDescriptionJob()));
	let descriptionLoading = $state(workflowJobIsActive(currentDescriptionJob()));
	let copiedDescription = $state(false);
	let metadataSaved = $state(false);
	let videoRefreshing = $state(false);
	let captionsFetching = $state(false);
	let applyingTitle = $state<string | null>(null);
	let selectedVideoType = $state(currentVideoType());
	let videoTitleFormatInput = $state(currentVideoTitleFormat());
	let titleOverrideEnabled = $state(Boolean(currentTitleOverride()));
	let titleOverrideInput = $state(currentTitleOverride());
	let enabledTitleValidationIds = $state<string[]>(currentEnabledTitleValidationIds());
	let speakerSelection = $state('');
	let selectedSpeakerId = $state('');
	let speakerName = $state('');
	let speakerPosition = $state('');
	let speakerCompany = $state('');
	let descriptionPollTimeout: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		selectedVideoType = currentVideoType();
		videoTitleFormatInput = currentVideoTitleFormat();
		titleOverrideEnabled = Boolean(currentTitleOverride());
		titleOverrideInput = currentTitleOverride();
		enabledTitleValidationIds = currentEnabledTitleValidationIds();
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

	function currentEnabledTitleValidationIds() {
		const disabledIds = new Set(data.videoView.video.disabledTitleValidationIds ?? []);

		return titleCheckDefinitions
			.filter((check) => !disabledIds.has(check.id))
			.map((check) => check.id);
	}

	function currentDescriptionJob() {
		return data.descriptionJob;
	}

	onMount(() => {
		void loadTitleAiChecks();

		if (workflowJobIsActive(descriptionJob)) {
			scheduleDescriptionJobPoll();
		}

		return () => {
			clearDescriptionJobPoll();
		};
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

	function descriptionJobError(job: DescriptionJob | null | undefined) {
		return job?.status === 'error' ? (job.error ?? 'Description generation failed.') : null;
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
			video: videoTitleRecord(),
			disabledTitleValidationIds: selectedDisabledTitleValidationIds()
		});
	}

	function activeTitleAiChecks() {
		return filterDisabledTitleValidations(titleAiChecks, selectedDisabledTitleValidationIds());
	}

	function selectedDisabledTitleValidationIds() {
		const enabledIds = new Set(enabledTitleValidationIds);

		return titleCheckDefinitions
			.map((check) => check.id)
			.filter((checkId) => !enabledIds.has(checkId));
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

			await loadTitleAiChecks();
			titleAlternativesByAssignmentId = {};
			metadataSaved = true;

			setTimeout(() => {
				metadataSaved = false;
			}, 1600);
		};
	}

	function afterVideoRefresh() {
		videoRefreshing = true;

		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				videoRefreshing = false;
			}
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
					await loadTitleAiChecks();
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

	function applyDescriptionJob(job: DescriptionJob | null) {
		descriptionJob = job;
		generatedDescription = job?.result ?? null;
		descriptionError = descriptionJobError(job);
		descriptionLoading = workflowJobIsActive(job);

		if (descriptionLoading) {
			scheduleDescriptionJobPoll();
		} else {
			clearDescriptionJobPoll();
		}
	}

	function clearDescriptionJobPoll() {
		if (descriptionPollTimeout) {
			clearTimeout(descriptionPollTimeout);
			descriptionPollTimeout = null;
		}
	}

	function scheduleDescriptionJobPoll() {
		clearDescriptionJobPoll();

		descriptionPollTimeout = setTimeout(() => {
			void refreshDescriptionJob();
		}, 1500);
	}

	async function refreshDescriptionJob() {
		try {
			const response = await fetch(
				`/videos/${encodeURIComponent(data.videoView.video._id)}/description`
			);
			const body = (await response.json().catch(() => ({}))) as {
				job?: DescriptionJob | null;
			};

			applyDescriptionJob(body.job ?? null);
			descriptionError =
				descriptionJobError(body.job) ??
				(response.ok ? null : `Description status failed with ${response.status}.`);
		} catch {
			descriptionError = 'Description status is temporarily unavailable.';
			scheduleDescriptionJobPoll();
		}
	}

	async function loadTitleAiChecks() {
		titleAiChecksLoading = true;
		titleAiChecksError = null;

		try {
			const response = await fetch(
				`/videos/${encodeURIComponent(data.videoView.video._id)}/title-ai-checks`,
				{
					method: 'POST'
				}
			);
			const body = (await response.json().catch(() => ({}))) as {
				validations?: VideoValidation[];
				error?: string | null;
			};

			titleAiChecks = body.validations ?? [];
			titleAiChecksError =
				body.error ?? (response.ok ? null : `AI title validation failed with ${response.status}.`);
		} catch {
			titleAiChecksError = 'AI title validation is temporarily unavailable.';
		} finally {
			titleAiChecksLoading = false;
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
				job?: DescriptionJob | null;
				error?: string | null;
			};

			applyDescriptionJob(body.job ?? null);
			descriptionError =
				body.error ??
				(response.ok ? null : `Description generation failed with ${response.status}.`);
		} catch {
			descriptionError = 'Description generation is temporarily unavailable.';
			descriptionLoading = false;
		} finally {
			if (!workflowJobIsActive(descriptionJob)) {
				descriptionLoading = false;
			}
		}
	}
</script>

<svelte:head>
	<title>{data.videoView.video.title}</title>
</svelte:head>

<main class="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
	<WorkflowJobPoller jobs={[data.refreshJob, data.captionJob, data.titleUpdateJob]} />

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
			<form method="POST" action="?/refreshVideo" use:enhance={afterVideoRefresh}>
				<IconButton
					type="submit"
					icon={RefreshCw}
					label={videoRefreshing ? 'Refreshing' : 'Refresh'}
					labelVisible
					size="md"
					disabled={videoRefreshing}
				/>
			</form>
		</div>
	</PageHeader>

	<section class="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3"
		>
			<div>
				<h2 class="text-sm font-semibold text-gray-950">Packaging Workbench</h2>
				<p class="mt-1 text-xs text-gray-500">
					{data.videoView.video.channelTitle ?? 'Unknown channel'} · {data.videoView.assignments
						.length} assignments
				</p>
			</div>
			<button
				type="submit"
				form="video-packaging-form"
				class="inline-flex items-center gap-2 rounded bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
			>
				<Save aria-hidden="true" class="h-4 w-4" strokeWidth={2} />
				{normalizeTitleOverride(selectedTitleOverride()) ? 'Save and Update YouTube' : 'Save'}
			</button>
		</div>
		<div class="grid lg:grid-cols-[280px_minmax(0,1fr)]">
			<div class="border-b border-gray-200 bg-gray-50 p-4 lg:border-r lg:border-b-0">
				{#if data.videoView.video.thumbnailUrl}
					<img
						src={data.videoView.video.thumbnailUrl}
						alt=""
						class="aspect-video w-full rounded border border-gray-200 object-cover"
					/>
				{:else}
					<div class="aspect-video rounded border border-gray-200 bg-gray-100"></div>
				{/if}
				<dl class="mt-4 space-y-3 text-sm">
					<div>
						<dt class="text-xs font-medium text-gray-500 uppercase">Published</dt>
						<dd class="mt-1 text-gray-950">{formatDate(data.videoView.video.videoPublishedAt)}</dd>
					</div>
					<div>
						<dt class="text-xs font-medium text-gray-500 uppercase">Last synced</dt>
						<dd class="mt-1 text-gray-950">{formatDate(data.videoView.video.lastFetchedAt)}</dd>
					</div>
				</dl>
				{#if form?.refreshError}
					<p
						class="mt-3 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700"
					>
						{form.refreshError}
					</p>
				{:else if data.refreshJob}
					<WorkflowJobStatus job={data.refreshJob} label="YouTube refresh" class="mt-3" />
				{:else if form?.refreshMessage}
					<p
						class="mt-3 rounded border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700"
					>
						{form.refreshMessage}
					</p>
				{/if}
			</div>
			<form
				id="video-packaging-form"
				method="POST"
				action="?/updateMetadata"
				use:enhance={afterMetadataUpdate}
				class="divide-y divide-gray-100"
			>
				<div class="grid gap-4 p-4 md:grid-cols-2">
					<div>
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
					<div>
						{#if canCustomizeVideoTitleFormat(selectedVideoType)}
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
						{:else}
							<p class="mb-1 text-sm text-gray-500">
								{videoTypeLabelFor(selectedVideoType)} format
							</p>
							<p
								class="rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-800"
							>
								{getDefaultVideoTypeTitleFormat(selectedVideoType)}
							</p>
						{/if}
					</div>
					<div class="md:col-span-2">
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
							<div class="mt-2">
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
					<div class="md:col-span-2">
						<p class="mb-2 text-sm text-gray-500">Active title checks</p>
						<div class="flex flex-wrap gap-2">
							{#each titleCheckDefinitions as check (check.id)}
								<label
									class="inline-flex items-center gap-2 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700"
								>
									<input
										type="checkbox"
										name="enabledTitleValidationIds"
										value={check.id}
										bind:group={enabledTitleValidationIds}
										class="h-4 w-4 rounded border-gray-300 text-gray-950 focus:ring-gray-950"
									/>
									<span>{check.label}</span>
									<span class="text-xs text-gray-400">{check.kind}</span>
								</label>
							{/each}
						</div>
						<div class="mt-3">
							{#if titleAiChecksLoading}
								<p class="text-sm text-gray-500">Checking AI title validations...</p>
							{:else if titleAiChecksError}
								<p class="text-sm text-amber-700">{titleAiChecksError}</p>
							{:else if activeTitleAiChecks().length}
								<div class="flex flex-wrap gap-2">
									{#each activeTitleAiChecks() as validation (validation.id)}
										<span
											class={`rounded border px-2 py-1 text-xs ${validationClass(validation.status)}`}
											title={validation.expected ? `Expected: ${validation.expected}` : undefined}
										>
											{validation.label}: {validation.message}
										</span>
									{/each}
								</div>
								{#each activeTitleAiChecks() as validation (validation.id)}
									{#if validation.details?.length}
										<p class="mt-2 text-xs text-gray-500">{validation.details.join(' ')}</p>
									{/if}
									{#if validation.suggested}
										<p class="mt-1 text-xs text-gray-500">Suggested: {validation.suggested}</p>
									{/if}
								{/each}
							{:else}
								<p class="text-sm text-gray-500">No active AI title checks have returned yet.</p>
							{/if}
						</div>
					</div>
				</div>
				<div class="px-4 py-3">
					{#if normalizeTitleOverride(selectedTitleOverride())}
						<p class="text-xs text-gray-500">
							Effective title:
							<span class="font-mono">{normalizeTitleOverride(selectedTitleOverride())}</span>
						</p>
					{:else}
						<p class="text-xs text-gray-500">
							Effective format:
							<span class="font-mono"
								>{normalizeComposedVideoTitleFormat(
									selectedVideoTitleFormat(),
									selectedVideoType
								)}</span
							>
						</p>
					{/if}
					{#if form?.metadataError}
						<p class="mt-2 text-sm text-amber-700">{form.metadataError}</p>
					{:else if metadataSaved}
						<p class="mt-2 text-sm text-green-700">{form?.metadataMessage ?? 'Saved'}</p>
					{/if}
				</div>
			</form>
		</div>
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
				<h2 class="text-sm font-semibold text-gray-950">Content Assets</h2>
				<p class="mt-1 text-xs text-gray-500">{data.captions.length} stored caption tracks</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					onclick={loadGeneratedDescription}
					disabled={descriptionLoading || data.captions.length === 0}
					class="rounded bg-gray-950 px-2.5 py-1.5 text-xs text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
				>
					{descriptionLoading ? workflowJobLabel(descriptionJob) : 'Generate Description'}
				</button>
				<form method="POST" action="?/fetchCaptions" use:enhance={afterCaptionFetch}>
					<button
						type="submit"
						disabled={captionsFetching}
						class="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
					>
						{captionsFetching ? 'Fetching...' : 'Fetch Captions'}
					</button>
				</form>
			</div>
		</div>
		<div class="grid divide-y divide-gray-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
			<div class="p-4">
				<h3 class="text-sm font-semibold text-gray-950">Description</h3>
				{#if data.videoView.video.description}
					<p
						class="mt-3 max-h-72 overflow-auto text-sm break-words whitespace-pre-wrap text-gray-700"
					>
						{data.videoView.video.description}
					</p>
				{:else}
					<p class="mt-3 text-sm text-gray-500">No description synced yet.</p>
				{/if}
				{#if data.captions.length === 0}
					<p class="mt-3 text-xs text-amber-700">Fetch captions before generating a description.</p>
				{/if}
				<WorkflowJobStatus
					job={descriptionJob}
					label="Description job"
					class="mt-4"
					showTimestamp
					size="md"
				/>
				{#if descriptionError && descriptionJob?.status !== 'error'}
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
								<p class="text-xs font-medium text-gray-500 uppercase">Generated</p>
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
								{copiedDescription ? 'Copied' : 'Copy'}
							</button>
						</div>
						<p
							class="mt-3 rounded border border-blue-100 bg-blue-50 px-2 py-1 text-sm text-blue-950"
						>
							{generatedDescription.hook}
						</p>
						<div class="mt-3 grid gap-3 xl:grid-cols-2">
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
											{link.label}:
											<span class="text-gray-500">{link.url ?? link.placeholder}</span>
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
			<div class="p-4">
				<h3 class="text-sm font-semibold text-gray-950">Captions</h3>
				{#if form?.captionError}
					<p
						class="mt-3 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700"
					>
						{form.captionError}
					</p>
				{:else if data.captionJob}
					<WorkflowJobStatus job={data.captionJob} label="Caption fetch" class="mt-3" size="md" />
				{:else if form?.captionMessage}
					<p
						class="mt-3 rounded border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700"
					>
						{form.captionMessage}
					</p>
				{/if}
				{#if data.captions.length}
					<div class="mt-3 space-y-3">
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
					<p class="mt-3 text-sm text-gray-500">No captions stored yet.</p>
				{/if}
			</div>
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
		{:else if data.titleUpdateJob}
			<WorkflowJobStatus
				job={data.titleUpdateJob}
				label="YouTube title update"
				class="rounded-none border-x-0 border-t-0 px-4 py-3"
				size="md"
			/>
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
