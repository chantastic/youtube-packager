import { env } from '$env/dynamic/private';

const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
const anthropicVersion = '2023-06-01';
const defaultDescriptionModel = 'claude-opus-4-7';
const transcriptPromptLimit = 120_000;

type AnthropicMessageResponse = {
	content?: Array<{
		type?: string;
		text?: string;
	}>;
	stop_reason?: string;
};

export type TranscriptCue = {
	startMs: number;
	endMs?: number;
	text: string;
};

export type DescriptionSpeakerContext = {
	name: string;
	company?: string;
	position?: string;
};

export type DescriptionEventContext = {
	name: string;
	editionTitle?: string;
	year?: number;
	titleFormat?: string;
};

type DescriptionAssignmentInput = {
	assignmentId: string;
	event: DescriptionEventContext;
};

export type DescriptionLink = {
	label: string;
	url?: string;
	placeholder?: string;
};

export type DescriptionChapter = {
	timestamp: string;
	title: string;
};

export type GeneratedDescription = {
	hook: string;
	metadata: Array<{ label: string; value: string }>;
	chapters: DescriptionChapter[];
	links: DescriptionLink[];
	description: string;
	model: string;
	chapterTarget: number;
	durationSeconds: number;
};

export type DescriptionGenerationInput = {
	video: {
		youtubeVideoId: string;
		title: string;
		description?: string;
		channelTitle?: string;
		publishedAt?: string;
		videoPublishedAt?: string;
		videoType?: string;
	};
	speakers: DescriptionSpeakerContext[];
	assignments: DescriptionAssignmentInput[];
	caption: {
		language?: string;
		name?: string;
		trackKind?: string;
		body: string;
	};
	host?: DescriptionLink;
};

type DescriptionResponse = Partial<Omit<GeneratedDescription, 'model'>>;

export type DescriptionGenerationResult = {
	description: GeneratedDescription | null;
	error: string | null;
};

function model() {
	return env.ANTHROPIC_DESCRIPTION_MODEL ?? defaultDescriptionModel;
}

function isOpus47Model(value: string) {
	return value === 'claude-opus-4-7' || value.startsWith('claude-opus-4-7-');
}

function descriptionOutputConfig(selectedModel: string) {
	return {
		...(isOpus47Model(selectedModel) ? { effort: 'xhigh' } : {}),
		format: {
			type: 'json_schema',
			schema: {
				type: 'object',
				properties: {
					hook: { type: 'string' },
					metadata: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								label: { type: 'string' },
								value: { type: 'string' }
							},
							required: ['label', 'value'],
							additionalProperties: false
						}
					},
					chapters: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								timestamp: { type: 'string' },
								title: { type: 'string' }
							},
							required: ['timestamp', 'title'],
							additionalProperties: false
						}
					},
					links: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								label: { type: 'string' },
								url: { type: 'string' },
								placeholder: { type: 'string' }
							},
							required: ['label', 'url', 'placeholder'],
							additionalProperties: false
						}
					},
					description: { type: 'string' }
				},
				required: ['hook', 'metadata', 'chapters', 'links', 'description'],
				additionalProperties: false
			}
		}
	};
}

function reasoningEffort() {
	return env.ANTHROPIC_DESCRIPTION_EFFORT ?? 'high';
}

function stripJsonFence(value: string) {
	return value
		.trim()
		.replace(/^```json\s*/i, '')
		.replace(/^```\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();
}

function textFromAnthropicResponse(response: AnthropicMessageResponse) {
	return response.content?.find((item) => item.type === 'text' && item.text)?.text ?? '';
}

function anthropicErrorMessage(message: string | undefined, status: number) {
	const fallback = `Anthropic description generation failed with ${status}.`;

	if (!message) {
		return fallback;
	}

	if (message.toLowerCase().includes('model')) {
		return `Anthropic description generation could not use model "${model()}". Set ANTHROPIC_DESCRIPTION_MODEL to a model available for this API key.`;
	}

	return message;
}

function parseSrtTimestamp(value: string) {
	const match = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);

	if (!match) return undefined;

	const [, hours, minutes, seconds, milliseconds] = match;

	return (
		Number(hours) * 60 * 60 * 1000 +
		Number(minutes) * 60 * 1000 +
		Number(seconds) * 1000 +
		Number(milliseconds.padEnd(3, '0'))
	);
}

export function parseSrtCues(body: string): TranscriptCue[] {
	return body
		.replace(/\r/g, '')
		.trim()
		.split(/\n{2,}/)
		.flatMap((block) => {
			const lines = block
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean);
			const timeIndex = lines.findIndex((line) => line.includes('-->'));

			if (timeIndex === -1) return [];

			const [start, end] = lines[timeIndex].split(/\s+-->\s+/);
			const startMs = parseSrtTimestamp(start);

			if (startMs === undefined) return [];

			const text = lines
				.slice(timeIndex + 1)
				.join(' ')
				.replace(/<[^>]+>/g, '')
				.replace(/\s+/g, ' ')
				.trim();

			if (!text) return [];

			return [
				{
					startMs,
					...(end ? { endMs: parseSrtTimestamp(end) } : {}),
					text
				}
			];
		});
}

export function formatChapterTimestamp(milliseconds: number) {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function transcriptDurationMs(cues: TranscriptCue[]) {
	return cues.reduce((duration, cue) => Math.max(duration, cue.endMs ?? cue.startMs), 0);
}

export function recommendedChapterCount(durationMs: number) {
	const minutes = durationMs / 60_000;

	if (minutes < 3) return 0;
	if (minutes < 6) return 3;
	if (minutes < 12) return 4;
	if (minutes < 20) return 6;
	if (minutes < 35) return 8;
	if (minutes < 55) return 10;

	return 12;
}

function transcriptWindows(cues: TranscriptCue[], windowMs = 30_000) {
	const windows: Array<{ startMs: number; text: string[] }> = [];

	for (const cue of cues) {
		const startMs = Math.floor(cue.startMs / windowMs) * windowMs;
		const current = windows.at(-1);

		if (!current || current.startMs !== startMs) {
			windows.push({ startMs, text: [cue.text] });
		} else {
			current.text.push(cue.text);
		}
	}

	return windows.map((window) => ({
		timestamp: formatChapterTimestamp(window.startMs),
		text: window.text.join(' ').replace(/\s+/g, ' ').trim()
	}));
}

function chapterTimestampCandidates(cues: TranscriptCue[]) {
	const durationMs = transcriptDurationMs(cues);
	const target = recommendedChapterCount(durationMs);

	if (target === 0) return [];

	const windows = transcriptWindows(cues);
	const candidates = new Map<string, string>();

	for (const window of windows) {
		candidates.set(window.timestamp, window.text);
	}

	candidates.set('0:00', windows[0]?.text ?? '');

	return [...candidates.entries()].map(([timestamp, text]) => ({
		timestamp,
		text: text.slice(0, 240)
	}));
}

function transcriptForPrompt(cues: TranscriptCue[]) {
	const lines = transcriptWindows(cues).map((window) => `[${window.timestamp}] ${window.text}`);
	const transcript = lines.join('\n');

	if (transcript.length <= transcriptPromptLimit) {
		return transcript;
	}

	const every = Math.ceil(transcript.length / transcriptPromptLimit);

	return lines.filter((_, index) => index % every === 0).join('\n');
}

function eventDisplayTitle(event: DescriptionEventContext) {
	return event.editionTitle ? `${event.name}: ${event.editionTitle}` : event.name;
}

function knownLinks(input: DescriptionGenerationInput) {
	return [
		...(input.host ? [input.host] : []),
		...input.speakers.map((speaker) => ({
			label: `${speaker.name} profile`,
			placeholder: `TODO: add ${speaker.name} profile URL`
		})),
		...input.assignments.map((assignment) => ({
			label: `${eventDisplayTitle(assignment.event)} event page`,
			placeholder: `TODO: add ${eventDisplayTitle(assignment.event)} event URL`
		}))
	];
}

function buildPrompt(input: DescriptionGenerationInput, cues: TranscriptCue[]) {
	const durationMs = transcriptDurationMs(cues);
	const chapterTarget = recommendedChapterCount(durationMs);
	const chapterCandidates = chapterTimestampCandidates(cues);
	const context = {
		video: input.video,
		speakers: input.speakers,
		assignments: input.assignments.map((assignment) => ({
			assignmentId: assignment.assignmentId,
			event: {
				...assignment.event,
				displayTitle: eventDisplayTitle(assignment.event)
			}
		})),
		caption: {
			language: input.caption.language,
			name: input.caption.name,
			trackKind: input.caption.trackKind,
			cueCount: cues.length,
			duration: formatChapterTimestamp(durationMs),
			durationSeconds: Math.round(durationMs / 1000)
		},
		chapterTarget,
		allowedChapterTimestamps: chapterCandidates,
		knownLinks: knownLinks(input)
	};

	return `Generate a structured YouTube description from this transcript.

Return only JSON in this exact shape:
{
  "hook": "first-line hook, 120 characters or fewer",
  "metadata": [{"label": "Speaker", "value": "Name, Role, Company"}],
  "chapters": [{"timestamp": "0:00", "title": "Chapter title"}],
  "links": [{"label": "WorkOS", "url": "https://workos.com", "placeholder": ""}],
  "description": "complete YouTube-ready description text"
}

Rules:
- Use a robust reasoning pass over the transcript before writing.
- The description must start with the hook as the first line.
- The hook must be 120 characters or fewer and should tell a viewer why this video matters.
- After the hook, include metadata such as speaker, company, position, event, video type, and major topics when available.
- Summarize chapter markers from the SRT timings.
- Choose ${chapterTarget} chapters for this video based on its duration.
- If chapterTarget is 0, return an empty chapters array.
- If chapterTarget is greater than 0, the first chapter must start at 0:00.
- Chapter timestamps must be copied exactly from allowedChapterTimestamps. Do not invent timestamps.
- Chapter titles should be useful, specific, and based on the transcript.
- Include a Links section.
- Include the known host link exactly when provided.
- Include product pages, personal profiles, and event homepage links only when the URL is provided or directly known from context.
- If a URL is needed but unknown, leave url as an empty string and write a clear TODO placeholder instead of inventing a URL.
- Do not use angle brackets.
- Keep the description polished, scannable, and ready to paste into YouTube Studio.

Context:
${JSON.stringify(context, null, 2)}

Transcript:
${transcriptForPrompt(cues)}`;
}

export function parseDescriptionResponse(value: string): DescriptionResponse {
	return JSON.parse(stripJsonFence(value)) as DescriptionResponse;
}

function cleanLine(value: unknown) {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeHook(value: unknown, fallback: string) {
	const hook = cleanLine(value) || fallback;

	return hook.length <= 120 ? hook : `${hook.slice(0, 119).trimEnd()}…`;
}

function normalizeMetadata(value: unknown): GeneratedDescription['metadata'] {
	if (!Array.isArray(value)) return [];

	return value
		.map((item) => {
			const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};

			return {
				label: cleanLine(record.label),
				value: cleanLine(record.value)
			};
		})
		.filter((item) => item.label && item.value);
}

function normalizeChapters(value: unknown): DescriptionChapter[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((item) => {
			const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};

			return {
				timestamp: cleanLine(record.timestamp),
				title: cleanLine(record.title)
			};
		})
		.filter((item) => item.timestamp && item.title);
}

function normalizeChaptersForTranscript(value: unknown, cues: TranscriptCue[]) {
	const target = recommendedChapterCount(transcriptDurationMs(cues));
	const allowed = new Set(chapterTimestampCandidates(cues).map((candidate) => candidate.timestamp));
	const seen = new Set<string>();
	const chapters = normalizeChapters(value).filter((chapter) => {
		if (!allowed.has(chapter.timestamp) || seen.has(chapter.timestamp)) {
			return false;
		}

		seen.add(chapter.timestamp);
		return true;
	});

	if (target === 0) return [];
	if (!chapters.some((chapter) => chapter.timestamp === '0:00')) {
		chapters.unshift({ timestamp: '0:00', title: 'Introduction' });
	}

	return chapters.slice(0, target);
}

function normalizeLinks(value: unknown): DescriptionLink[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((item) => {
			const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
			const url = cleanLine(record.url);
			const placeholder = cleanLine(record.placeholder);

			return {
				label: cleanLine(record.label),
				...(url ? { url } : {}),
				...(placeholder ? { placeholder } : {})
			};
		})
		.filter((item) => item.label && (item.url || item.placeholder));
}

function descriptionFromParts(
	hook: string,
	metadata: GeneratedDescription['metadata'],
	chapters: DescriptionChapter[],
	links: DescriptionLink[]
) {
	const metadataLines = metadata.map((item) => `${item.label}: ${item.value}`);
	const chapterLines = chapters.map((chapter) => `${chapter.timestamp} ${chapter.title}`);
	const linkLines = links.map((link) => `${link.label}: ${link.url ?? link.placeholder}`);

	return [
		hook,
		metadataLines.length ? `\n${metadataLines.join('\n')}` : '',
		chapterLines.length ? `\nChapters\n${chapterLines.join('\n')}` : '',
		linkLines.length ? `\nLinks\n${linkLines.join('\n')}` : ''
	]
		.filter(Boolean)
		.join('\n')
		.trim();
}

function normalizeGeneratedDescription(
	value: DescriptionResponse,
	input: DescriptionGenerationInput,
	cues: TranscriptCue[]
): GeneratedDescription {
	const fallbackHook = `Learn the key ideas from ${input.video.title}`;
	const hook = normalizeHook(value.hook, fallbackHook);
	const metadata = normalizeMetadata(value.metadata);
	const chapters = normalizeChaptersForTranscript(value.chapters, cues);
	const links = normalizeLinks(value.links);
	const parsedDescription = typeof value.description === 'string' ? value.description.trim() : '';
	const description = parsedDescription || descriptionFromParts(hook, metadata, chapters, links);
	const durationMs = transcriptDurationMs(cues);

	return {
		hook,
		metadata,
		chapters,
		links,
		description: description.startsWith(hook) ? description : `${hook}\n\n${description}`,
		model: model(),
		chapterTarget: recommendedChapterCount(durationMs),
		durationSeconds: Math.round(durationMs / 1000)
	};
}

export async function generateDescriptionWithAnthropic(
	input: DescriptionGenerationInput
): Promise<DescriptionGenerationResult> {
	const cues = parseSrtCues(input.caption.body);

	if (cues.length === 0) {
		return {
			description: null,
			error: 'Stored captions do not contain readable SRT cues.'
		};
	}

	if (!env.ANTHROPIC_API_KEY) {
		return {
			description: null,
			error: 'Set ANTHROPIC_API_KEY to generate descriptions.'
		};
	}

	let response: Response;

	try {
		const selectedModel = model();
		response = await fetch(anthropicApiUrl, {
			method: 'POST',
			headers: {
				'x-api-key': env.ANTHROPIC_API_KEY,
				'anthropic-version': anthropicVersion,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				model: selectedModel,
				max_tokens: 8192,
				...(isOpus47Model(selectedModel)
					? {
							thinking: {
								type: 'adaptive'
							}
						}
					: {}),
				output_config: {
					...descriptionOutputConfig(selectedModel),
					...(isOpus47Model(selectedModel) ? { effort: reasoningEffort() } : {})
				},
				messages: [
					{
						role: 'user',
						content: buildPrompt(input, cues)
					}
				]
			})
		});
	} catch {
		return {
			description: null,
			error: 'Anthropic description generation is temporarily unavailable.'
		};
	}

	const body = (await response.json().catch(() => ({}))) as AnthropicMessageResponse & {
		error?: { message?: string };
	};

	if (!response.ok) {
		return {
			description: null,
			error: anthropicErrorMessage(body.error?.message, response.status)
		};
	}

	if (body.stop_reason === 'max_tokens') {
		return {
			description: null,
			error: 'Anthropic description generation response was truncated.'
		};
	}

	try {
		return {
			description: normalizeGeneratedDescription(
				parseDescriptionResponse(textFromAnthropicResponse(body)),
				input,
				cues
			),
			error: null
		};
	} catch {
		return {
			description: null,
			error: 'Anthropic returned an unreadable description.'
		};
	}
}
