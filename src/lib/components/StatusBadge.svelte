<script lang="ts">
	import type { ComponentType } from 'svelte';

	type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

	type IconComponent = ComponentType;

	type Props = {
		icon?: IconComponent;
		label: string;
		tone?: Tone;
		title?: string;
	};

	let { icon: Icon, label, tone = 'neutral', title }: Props = $props();

	const toneClasses = {
		neutral: 'border-gray-200 bg-gray-50 text-gray-600',
		success: 'border-green-200 bg-green-50 text-green-700',
		warning: 'border-amber-200 bg-amber-50 text-amber-800',
		danger: 'border-red-200 bg-red-50 text-red-700',
		info: 'border-blue-200 bg-blue-50 text-blue-700'
	};
</script>

<span
	class={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
	{title}
>
	{#if Icon}
		<Icon aria-hidden="true" class="h-3.5 w-3.5" strokeWidth={2} />
	{/if}
	<span>{label}</span>
</span>
