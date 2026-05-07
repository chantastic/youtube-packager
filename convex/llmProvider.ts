export type LlmTask = 'titleChecks' | 'titleAlternatives' | 'descriptionGeneration';

export type LlmMessageRequest = {
	task: LlmTask;
	prompt: string;
	maxTokens: number;
};

export type LlmMessageResult = {
	text: string;
	model: string;
	stopReason: string | null;
	error: string | null;
};

export type LlmCacheConfig = {
	model: string;
	provider: string;
	version: string;
	config: Record<string, unknown>;
};

export type LlmProvider = {
	cacheConfigFor(request: Pick<LlmMessageRequest, 'task' | 'maxTokens'>): LlmCacheConfig;
	createMessage(request: LlmMessageRequest): Promise<LlmMessageResult>;
};
