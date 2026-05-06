<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		children: Snippet;
		description?: string;
		id?: string;
		onClose?: () => void;
		open?: boolean;
		title: string;
	};

	let {
		children,
		description,
		id = 'modal-dialog',
		onClose = () => {},
		open = false,
		title
	}: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let panel = $state<HTMLElement | null>(null);
	let titleId = $derived(`modal-title-${id}`);
	let descriptionId = $derived(`modal-description-${id}`);

	function requestClose() {
		onClose();
	}

	function handleCancel(event: Event) {
		event.preventDefault();
		requestClose();
	}

	function handleClose() {
		if (open) requestClose();
	}

	function handleDialogClick(event: MouseEvent) {
		const target = event.target;
		if (target instanceof Node && panel && !panel.contains(target)) requestClose();
	}

	$effect(() => {
		if (!dialog) return;

		if (!open) {
			if (dialog.open) dialog.close();
			return;
		}

		if (!dialog.open) dialog.showModal();
		requestAnimationFrame(() => {
			const focusTarget = dialog?.querySelector<HTMLElement>(
				'[data-autofocus], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
			);
			focusTarget?.focus();
		});

		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = originalOverflow;
		};
	});
</script>

<dialog
	bind:this={dialog}
	aria-describedby={description ? descriptionId : undefined}
	aria-labelledby={titleId}
	class="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-transparent p-4 sm:p-6"
	oncancel={handleCancel}
	onclick={handleDialogClick}
	onclose={handleClose}
>
	<div class="flex min-h-full items-center justify-center">
		<section
			bind:this={panel}
			class="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl sm:max-h-[calc(100dvh-3rem)]"
		>
			<div class="border-b border-gray-200 px-5 py-4 sm:px-6">
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<h2 id={titleId} class="text-base font-semibold text-gray-950">{title}</h2>
						{#if description}
							<p id={descriptionId} class="mt-1 text-sm text-gray-500">{description}</p>
						{/if}
					</div>
					<button
						type="button"
						aria-label="Close modal"
						class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:ring-2 focus:ring-gray-950 focus:outline-none"
						onclick={requestClose}
					>
						<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="h-5 w-5">
							<path
								fill-rule="evenodd"
								d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414Z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
				</div>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
				{@render children()}
			</div>
		</section>
	</div>
</dialog>

<style>
	dialog::backdrop {
		background: rgb(17 24 39 / 0.5);
	}
</style>
