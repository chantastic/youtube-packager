<script lang="ts">
	import { resolve } from '$app/paths';

	type Props = {
		detail?: string;
		href: string;
		label: string;
		score?: number;
		title?: string;
	};

	let { detail, href, label, score, title }: Props = $props();

	const radius = 42;
	const circumference = 2 * Math.PI * radius;
	const normalizedScore = $derived(
		score === undefined ? undefined : Math.max(0, Math.min(100, Math.round(score)))
	);
	const offset = $derived(
		normalizedScore === undefined
			? circumference
			: circumference - (normalizedScore / 100) * circumference
	);
	const scoreColor = $derived.by(() => {
		if (normalizedScore === undefined) return '#64748b';
		if (normalizedScore >= 90) return '#0cce6b';
		if (normalizedScore >= 50) return '#ffa400';
		return '#ff4e42';
	});
	const scoreClass = $derived.by(() => {
		if (normalizedScore === undefined) return 'text-slate-600';
		if (normalizedScore >= 90) return 'text-green-700';
		if (normalizedScore >= 50) return 'text-orange-700';
		return 'text-red-700';
	});
	const resolvedHref = $derived(href.startsWith('/') ? resolve(href as '/') : href);
	const controlTitle = $derived(title ?? `${label}: ${detail ?? normalizedScore ?? 'No score'}`);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href={resolvedHref}
	class="group inline-grid w-24 justify-items-center gap-2 rounded px-1 py-1.5 text-center transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 focus-visible:outline-none"
	title={controlTitle}
	aria-label={controlTitle}
>
	<span class="relative grid h-20 w-20 place-items-center">
		<svg aria-hidden="true" class="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
			<circle cx="50" cy="50" r="42" fill={scoreColor} fill-opacity="0.1" />
			<circle
				cx="50"
				cy="50"
				r={radius}
				fill="none"
				stroke={scoreColor}
				stroke-opacity="0.18"
				stroke-width="6"
			/>
			<circle
				cx="50"
				cy="50"
				r={radius}
				fill="none"
				stroke={scoreColor}
				stroke-dasharray={circumference}
				stroke-dashoffset={offset}
				stroke-linecap="round"
				stroke-width="6"
				transform="rotate(-90 50 50)"
			/>
		</svg>
		<span class={`relative font-mono text-2xl font-semibold ${scoreClass}`}>
			{normalizedScore ?? '-'}
		</span>
	</span>
	<span class="min-w-0">
		<span class="block text-sm leading-tight font-semibold text-gray-950 group-hover:text-blue-700">
			{label}
		</span>
		{#if detail}
			<span class="mt-0.5 block text-xs leading-tight text-gray-500">{detail}</span>
		{/if}
	</span>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
