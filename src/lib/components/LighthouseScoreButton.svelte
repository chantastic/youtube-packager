<script lang="ts">
	type Props = {
		detail?: string;
		disabled?: boolean;
		label: string;
		title?: string;
	};

	let { detail = 'Build', disabled = false, label, title }: Props = $props();

	const controlTitle = $derived(title ?? `${label}: ${detail}`);
</script>

<button
	type="submit"
	class="group inline-grid w-24 justify-items-center gap-2 rounded px-1 py-1.5 text-center transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
	{disabled}
	title={controlTitle}
	aria-label={controlTitle}
>
	<span class="relative grid h-20 w-20 place-items-center">
		<svg aria-hidden="true" class="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
			<circle cx="50" cy="50" r="42" fill="#64748b" fill-opacity="0.08" />
			<circle
				cx="50"
				cy="50"
				r="42"
				fill="none"
				stroke="#64748b"
				stroke-dasharray="10 8"
				stroke-linecap="round"
				stroke-opacity="0.55"
				stroke-width="6"
				transform="rotate(-90 50 50)"
			/>
		</svg>
		<span class="relative font-mono text-xl font-semibold text-slate-600">
			{disabled ? '...' : '+'}
		</span>
	</span>
	<span class="min-w-0">
		<span class="block text-sm leading-tight font-semibold text-gray-950 group-hover:text-blue-700">
			{label}
		</span>
		<span class="mt-0.5 block text-xs leading-tight text-gray-500">{detail}</span>
	</span>
</button>
