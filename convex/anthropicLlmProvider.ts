import {
	getAnthropicApiKey,
	getAnthropicDescriptionEffort,
	getAnthropicDescriptionModel,
	getAnthropicModel
} from './secrets';
import { descriptionOutputConfig, isOpus47Model } from '../src/lib/description-generation';
import type { LlmMessageRequest, LlmProvider, LlmTask } from './llmProvider';

const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
export const anthropicVersion = '2023-06-01';
export const defaultTitleModel = 'claude-haiku-4-5-20251001';
export const defaultDescriptionModel = 'claude-opus-4-7';
const defaultDescriptionEffort = 'high';

type AnthropicMessageResponse = {
	content?: Array<{
		type?: string;
		text?: string;
	}>;
	stop_reason?: string;
	error?: {
		message?: string;
	};
};

function modelForTask(task: LlmTask) {
	return task === 'descriptionGeneration'
		? getAnthropicDescriptionModel(defaultDescriptionModel)
		: getAnthropicModel(defaultTitleModel);
}

function missingApiKeyMessage(task: LlmTask) {
	if (task === 'titleChecks') return 'Set ANTHROPIC_API_KEY to run AI title checks.';
	if (task === 'titleAlternatives') return 'Set ANTHROPIC_API_KEY to generate title alternatives.';
	return 'Set ANTHROPIC_API_KEY to generate descriptions.';
}

function unavailableMessage(task: LlmTask) {
	if (task === 'titleChecks') return 'Anthropic title validation is temporarily unavailable.';
	if (task === 'titleAlternatives')
		return 'Anthropic title alternatives are temporarily unavailable.';
	return 'Anthropic description generation is temporarily unavailable.';
}

function fallbackMessage(task: LlmTask, status: number) {
	if (task === 'titleChecks') return `Anthropic validation failed with ${status}.`;
	if (task === 'titleAlternatives') return `Anthropic title alternatives failed with ${status}.`;
	return `Anthropic description generation failed with ${status}.`;
}

function modelErrorMessage(task: LlmTask, model: string) {
	if (task === 'titleChecks') {
		return `Anthropic title validation could not use model "${model}". Set ANTHROPIC_MODEL to a model available for this API key.`;
	}

	if (task === 'titleAlternatives') {
		return `Anthropic title alternatives could not use model "${model}". Set ANTHROPIC_MODEL to a model available for this API key.`;
	}

	return `Anthropic description generation could not use model "${model}". Set ANTHROPIC_DESCRIPTION_MODEL to a model available for this API key.`;
}

function providerErrorMessage(
	task: LlmTask,
	model: string,
	message: string | undefined,
	status: number
) {
	if (!message) {
		return fallbackMessage(task, status);
	}

	if (message.toLowerCase().includes('model')) {
		return modelErrorMessage(task, model);
	}

	return message;
}

function textFromAnthropicResponse(response: AnthropicMessageResponse) {
	return response.content?.find((item) => item.type === 'text' && item.text)?.text ?? '';
}

function requestBodyFor(request: LlmMessageRequest, model: string) {
	return {
		model,
		max_tokens: request.maxTokens,
		...(request.task === 'descriptionGeneration' && isOpus47Model(model)
			? {
					thinking: {
						type: 'adaptive'
					}
				}
			: {}),
		...(request.task === 'descriptionGeneration'
			? {
					output_config: {
						...descriptionOutputConfig(model),
						...(isOpus47Model(model)
							? { effort: getAnthropicDescriptionEffort(defaultDescriptionEffort) }
							: {})
					}
				}
			: {}),
		messages: [
			{
				role: 'user',
				content: request.prompt
			}
		]
	};
}

export const anthropicLlmProvider: LlmProvider = {
	cacheConfigFor(request) {
		return {
			model: modelForTask(request.task),
			provider: 'anthropic',
			version: anthropicVersion,
			config: {
				maxTokens: request.maxTokens,
				task: request.task
			}
		};
	},

	async createMessage(request) {
		const apiKey = getAnthropicApiKey();
		const model = modelForTask(request.task);

		if (!apiKey) {
			return {
				text: '',
				model,
				stopReason: null,
				error: missingApiKeyMessage(request.task)
			};
		}

		let response: Response;

		try {
			response = await fetch(anthropicApiUrl, {
				method: 'POST',
				headers: {
					'x-api-key': apiKey,
					'anthropic-version': anthropicVersion,
					'content-type': 'application/json'
				},
				body: JSON.stringify(requestBodyFor(request, model))
			});
		} catch {
			return {
				text: '',
				model,
				stopReason: null,
				error: unavailableMessage(request.task)
			};
		}

		const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse;

		if (!response.ok) {
			return {
				text: '',
				model,
				stopReason: body.stop_reason ?? null,
				error: providerErrorMessage(request.task, model, body.error?.message, response.status)
			};
		}

		return {
			text: textFromAnthropicResponse(body),
			model,
			stopReason: body.stop_reason ?? null,
			error: null
		};
	}
};
