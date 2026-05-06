import type { VideoType } from './title-format';

export type EventType = 'conference' | 'interviews';

export const defaultEventType: EventType = 'conference';

export const eventTypeOptions = [
	{
		value: 'conference',
		label: 'Conference',
		defaultVideoType: 'talk'
	},
	{
		value: 'interviews',
		label: 'Interviews',
		defaultVideoType: 'interview'
	}
] as const satisfies ReadonlyArray<{
	value: EventType;
	label: string;
	defaultVideoType: VideoType;
}>;

export function isEventType(value: unknown): value is EventType {
	return eventTypeOptions.some((option) => option.value === value);
}

export function normalizeEventType(value: unknown): EventType {
	return isEventType(value) ? value : defaultEventType;
}

export function eventTypeLabelFor(value: unknown) {
	const eventType = normalizeEventType(value);

	return eventTypeOptions.find((option) => option.value === eventType)?.label ?? 'Conference';
}

export function defaultVideoTypeForEventType(value: unknown) {
	const eventType = normalizeEventType(value);

	return (
		eventTypeOptions.find((option) => option.value === eventType)?.defaultVideoType ?? 'talk'
	);
}
