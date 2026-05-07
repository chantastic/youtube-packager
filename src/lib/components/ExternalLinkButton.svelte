<script lang="ts">
	import { ExternalLink } from 'lucide-svelte';
	import type { ComponentType } from 'svelte';
	import IconButton from './IconButton.svelte';

	type IconComponent = ComponentType;

	type Props = {
		href: string;
		icon?: IconComponent;
		label: string;
		labelVisible?: boolean;
		size?: 'sm' | 'md';
		title?: string;
		tone?: 'neutral' | 'primary' | 'danger';
	};

	let {
		href,
		icon = ExternalLink,
		label,
		labelVisible = false,
		size = 'sm',
		title,
		tone = 'neutral'
	}: Props = $props();
</script>

<IconButton
	{href}
	{icon}
	{label}
	{labelVisible}
	rel="noreferrer"
	{size}
	target="_blank"
	{title}
	{tone}
/>
