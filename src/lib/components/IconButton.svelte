<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ComponentType } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Tone = 'neutral' | 'primary' | 'danger';
	type Size = 'sm' | 'md';

	type IconComponent = ComponentType;

	type Props = {
		disabled?: boolean;
		href?: string;
		icon: IconComponent;
		label: string;
		labelVisible?: boolean;
		onclick?: (event: MouseEvent) => void;
		rel?: HTMLAnchorAttributes['rel'];
		size?: Size;
		target?: HTMLAnchorAttributes['target'];
		title?: string;
		tone?: Tone;
		type?: HTMLButtonAttributes['type'];
	};

	let {
		disabled = false,
		href,
		icon: Icon,
		label,
		labelVisible = false,
		onclick,
		rel,
		size = 'sm',
		target,
		title,
		tone = 'neutral',
		type = 'button'
	}: Props = $props();

	const toneClasses = {
		neutral:
			'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-950',
		primary: 'border-gray-950 bg-gray-950 text-white hover:border-gray-800 hover:bg-gray-800',
		danger: 'border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50'
	};
	const iconClasses = {
		sm: 'h-4 w-4',
		md: 'h-4.5 w-4.5'
	};
	const sizeClass = $derived(
		{
			sm: labelVisible ? 'h-8 gap-1.5 px-2.5 text-xs' : 'h-8 w-8',
			md: labelVisible ? 'h-9 gap-2 px-3 text-sm' : 'h-9 w-9'
		}[size]
	);
	const controlTitle = $derived(title ?? label);
	const className = $derived(
		[
			'inline-flex shrink-0 items-center justify-center rounded border font-medium transition-colors',
			'focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 focus-visible:outline-none',
			'disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400',
			sizeClass,
			toneClasses[tone]
		].join(' ')
	);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#if href}
	<a
		aria-label={label}
		class={className}
		href={disabled ? undefined : href?.startsWith('/') ? resolve(href as '/') : href}
		{rel}
		{target}
		title={controlTitle}
	>
		<Icon aria-hidden="true" class={iconClasses[size]} strokeWidth={2} />
		{#if labelVisible}
			<span>{label}</span>
		{/if}
	</a>
{:else}
	<button aria-label={label} class={className} {disabled} {onclick} title={controlTitle} {type}>
		<Icon aria-hidden="true" class={iconClasses[size]} strokeWidth={2} />
		{#if labelVisible}
			<span>{label}</span>
		{/if}
	</button>
{/if}
<!-- eslint-enable svelte/no-navigation-without-resolve -->
