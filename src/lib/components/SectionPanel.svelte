<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		bodyClass?: string;
		children: Snippet;
		description?: string;
		title?: string;
	};

	let { bodyClass = 'px-4 py-4', children, description, title }: Props = $props();
</script>

<section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
	{#if title || description}
		<div
			class="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3"
		>
			{#if title}
				<h2 class="text-sm font-semibold text-gray-950">{title}</h2>
			{/if}
			{#if description}
				<p class="text-sm text-gray-500">{description}</p>
			{/if}
		</div>
	{/if}
	<div class={bodyClass}>
		{@render children()}
	</div>
</section>
