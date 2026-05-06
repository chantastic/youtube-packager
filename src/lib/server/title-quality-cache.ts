import { getConvexClient } from '$lib/server/convex';
import {
	titleQualityValidationModel,
	titleQualityValidationVersion
} from '$lib/server/anthropic-title-validation';
import type { VideoValidation } from '$lib/video-validation';
import { api } from '../../../convex/_generated/api';

type TitleInput = {
	videoId: string;
	title: string;
};

export type TitleQualityCacheKey = {
	videoId: string;
	titleHash: string;
	model: string;
	validationVersion: string;
};

export type TitleQualityCacheEntry = TitleQualityCacheKey & {
	title: string;
	validations: VideoValidation[];
	checkedAt: number;
};

export type TitleQualityCachePlan = {
	entries: Array<
		TitleInput & {
			cacheKey: TitleQualityCacheKey;
		}
	>;
	cachedValidationsByVideoId: Record<string, VideoValidation[]>;
	misses: TitleInput[];
};

async function sha256Hex(value: string) {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);

	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

export async function titleQualityCacheKey(title: TitleInput): Promise<TitleQualityCacheKey> {
	return {
		videoId: title.videoId,
		titleHash: await sha256Hex(title.title),
		model: titleQualityValidationModel(),
		validationVersion: titleQualityValidationVersion
	};
}

export async function planTitleQualityCache(titles: TitleInput[]): Promise<TitleQualityCachePlan> {
	const entries = await Promise.all(
		titles.map(async (title) => ({
			...title,
			cacheKey: await titleQualityCacheKey(title)
		}))
	);
	const cached = await getConvexClient().query(api.titleQualityChecks.getMany, {
		keys: entries.map((entry) => entry.cacheKey)
	});
	const cachedByKey = new Map(
		cached.map((check) => [
			`${check.videoId}:${check.titleHash}:${check.model}:${check.validationVersion}`,
			check.validations
		])
	);
	const cachedValidationsByVideoId: Record<string, VideoValidation[]> = {};
	const misses: TitleInput[] = [];

	for (const entry of entries) {
		const key = `${entry.cacheKey.videoId}:${entry.cacheKey.titleHash}:${entry.cacheKey.model}:${entry.cacheKey.validationVersion}`;
		const cachedValidations = cachedByKey.get(key);

		if (cachedValidations) {
			cachedValidationsByVideoId[entry.videoId] = cachedValidations;
		} else {
			misses.push({
				videoId: entry.videoId,
				title: entry.title
			});
		}
	}

	return {
		entries,
		cachedValidationsByVideoId,
		misses
	};
}

export async function saveTitleQualityCache(entries: TitleQualityCacheEntry[]) {
	if (entries.length === 0) {
		return;
	}

	await getConvexClient().mutation(api.titleQualityChecks.upsertMany, {
		checks: entries
	});
}
