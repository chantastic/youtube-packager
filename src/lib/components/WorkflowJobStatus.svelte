<script lang="ts">
	import {
		workflowJobLabel,
		workflowJobTimestamp,
		workflowJobToneClass,
		type WorkflowJobLike
	} from '$lib/workflow-job';

	type Props = {
		class?: string;
		job?: WorkflowJobLike;
		label: string;
		showTimestamp?: boolean;
		size?: 'sm' | 'md';
	};

	let {
		class: className = '',
		job = null,
		label,
		showTimestamp = false,
		size = 'sm'
	}: Props = $props();

	const timestamp = $derived(workflowJobTimestamp(job));
	const sizeClass = $derived(size === 'md' ? 'text-sm' : 'text-xs');

	function formatDate(value: number) {
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
	}
</script>

{#if job}
	<div class={`rounded border px-3 py-2 ${sizeClass} ${workflowJobToneClass(job)} ${className}`}>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<p class="font-medium">{label}: {workflowJobLabel(job)}</p>
			{#if showTimestamp && timestamp}
				<p class="opacity-80">{timestamp.label} {formatDate(timestamp.value)}</p>
			{/if}
		</div>
		{#if job.error}
			<p class="mt-1">{job.error}</p>
		{/if}
	</div>
{/if}
