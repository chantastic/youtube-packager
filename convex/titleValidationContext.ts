import type { VideoTitleFormatRecord } from '../src/lib/title-format';

type SpeakerValidationRow = {
	speaker: {
		name: string;
		company?: string;
		position?: string;
	};
};

type VideoValidationRecord = {
	titleOverride?: string;
	videoTitleFormat?: string;
	videoType?: VideoTitleFormatRecord['videoType'];
};

export function speakerRecordsForValidation(speakers: SpeakerValidationRow[]) {
	return speakers.map((row) => ({
		name: row.speaker.name,
		...(row.speaker.company !== undefined ? { company: row.speaker.company } : {}),
		...(row.speaker.position !== undefined ? { position: row.speaker.position } : {})
	}));
}

export function videoRecordForValidation(
	video: VideoValidationRecord,
	speakers: SpeakerValidationRow[]
): VideoTitleFormatRecord {
	const speaker = speakers.map((row) => row.speaker.name).join(', ');
	const company = [
		...new Set(
			speakers.map((row) => row.speaker.company).filter((value): value is string => Boolean(value))
		)
	].join(', ');
	const position = [
		...new Set(
			speakers.map((row) => row.speaker.position).filter((value): value is string => Boolean(value))
		)
	].join(', ');

	return {
		speaker: speaker || undefined,
		company: company || undefined,
		position: position || undefined,
		titleOverride: video.titleOverride,
		videoTitleFormat: video.videoTitleFormat,
		videoType: video.videoType
	};
}
