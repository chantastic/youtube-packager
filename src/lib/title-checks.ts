export const titleCheckDefinitions = [
	{
		id: 'hook',
		label: 'Hook',
		kind: 'ai',
		aggregate: true
	},
	{
		id: 'profile',
		label: 'Profile',
		kind: 'static',
		aggregate: true
	},
	{
		id: 'event',
		label: 'Event',
		kind: 'static',
		aggregate: true
	},
	{
		id: 'format',
		label: 'Format',
		kind: 'static',
		aggregate: true
	},
	{
		id: 'mechanics',
		label: 'Mechanics',
		kind: 'ai',
		aggregate: true
	}
] as const;

export type TitleCheckDefinition = (typeof titleCheckDefinitions)[number];
export type TitleCheckId = TitleCheckDefinition['id'];
export type TitleAiCheckId = Extract<TitleCheckDefinition, { kind: 'ai' }>['id'];

export const titleCheckOrder = titleCheckDefinitions.map((check) => check.id);
export const titleAiCheckIds = titleCheckDefinitions
	.filter((check): check is Extract<TitleCheckDefinition, { kind: 'ai' }> => check.kind === 'ai')
	.map((check) => check.id);

export function titleCheckDefinitionFor(checkId: string) {
	return titleCheckDefinitions.find((check) => check.id === checkId);
}

export function titleCheckLabel(checkId: string) {
	return titleCheckDefinitionFor(checkId)?.label ?? checkId;
}

export function isTitleAiCheckId(checkId: string): checkId is TitleAiCheckId {
	return titleAiCheckIds.includes(checkId as TitleAiCheckId);
}
