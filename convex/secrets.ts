export function getAnthropicApiKey() {
	return process.env.ANTHROPIC_API_KEY;
}

export function getAnthropicModel(defaultModel: string) {
	return process.env.ANTHROPIC_MODEL ?? defaultModel;
}

export function getAnthropicDescriptionModel(defaultModel: string) {
	return process.env.ANTHROPIC_DESCRIPTION_MODEL ?? defaultModel;
}

export function getAnthropicDescriptionEffort(defaultEffort: string) {
	return process.env.ANTHROPIC_DESCRIPTION_EFFORT ?? defaultEffort;
}
