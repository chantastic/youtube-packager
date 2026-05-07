<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		backHref?: string;
		backLabel?: string;
		children?: Snippet;
		eyebrow?: string;
		subtitle?: string;
		title: string;
	};

	let { backHref, backLabel = 'Back', children, eyebrow, subtitle, title }: Props = $props();
</script>

<header class="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
	<div class="min-w-0">
		{#if backHref}
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={backHref.startsWith('/') ? resolve(backHref as '/') : backHref}
				class="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-950"
			>
				<ArrowLeft aria-hidden="true" class="h-4 w-4" />
				{backLabel}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{:else if eyebrow}
			<p class="text-sm font-medium text-gray-500">{eyebrow}</p>
		{/if}
		<h1 class="mt-1 text-3xl font-semibold tracking-normal text-gray-950">{title}</h1>
		{#if subtitle}
			<p class="mt-1 text-sm text-gray-500">{subtitle}</p>
		{/if}
	</div>
	{#if children}
		<div class="flex flex-col gap-3 sm:items-end">
			{@render children()}
		</div>
	{/if}
</header>
