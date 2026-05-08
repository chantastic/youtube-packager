type TitleAiValidationInputKeyParts = {
	videoId: string;
	field: string;
	checkId: string;
	input: unknown;
};

function stableHash(value: string) {
	let h1 = 0xdeadbeef ^ value.length;
	let h2 = 0x41c6ce57 ^ value.length;

	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		h1 = Math.imul(h1 ^ code, 2654435761);
		h2 = Math.imul(h2 ^ code, 1597334677);
	}

	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function titleAiValidationInputKey(input: TitleAiValidationInputKeyParts) {
	const snapshot = JSON.stringify(input.input);

	return [
		'input',
		input.videoId,
		input.field,
		input.checkId,
		snapshot.length.toString(36),
		stableHash(snapshot)
	].join(':');
}
