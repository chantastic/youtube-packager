<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { workflowJobIsActive, type WorkflowJobLike } from '$lib/workflow-job';
	import { onDestroy } from 'svelte';

	type Props = {
		dependency?: string;
		intervalMs?: number;
		jobs?: WorkflowJobLike[];
	};

	let { dependency = 'app:workflow-jobs', intervalMs = 1500, jobs = [] }: Props = $props();
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let pollToken = 0;

	const hasActiveJob = $derived(jobs.some((job) => workflowJobIsActive(job)));

	$effect(() => {
		if (!browser) return;

		pollToken += 1;
		const token = pollToken;
		clearPoll();

		if (hasActiveJob) {
			schedulePoll(token);
		}

		return () => {
			pollToken += 1;
			clearPoll();
		};
	});

	onDestroy(() => {
		pollToken += 1;
		clearPoll();
	});

	function clearPoll() {
		if (timeout) {
			clearTimeout(timeout);
		}

		timeout = null;
	}

	function schedulePoll(token: number) {
		clearPoll();
		timeout = setTimeout(() => {
			void poll(token);
		}, intervalMs);
	}

	async function poll(token: number) {
		clearPoll();

		if (token !== pollToken || !hasActiveJob) {
			return;
		}

		try {
			await invalidate(dependency);
		} finally {
			if (token === pollToken && hasActiveJob) {
				schedulePoll(token);
			}
		}
	}
</script>
