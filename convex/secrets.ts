export function getAnthropicApiKey() {
	return process.env.ANTHROPIC_API_KEY;
}

export function getAnthropicModel(defaultModel: string) {
	return process.env.ANTHROPIC_MODEL ?? defaultModel;
}
