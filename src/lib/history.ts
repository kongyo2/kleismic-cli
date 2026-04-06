function parseRawHistory(history: string | null | undefined) {
	try {
		const parsed = JSON.parse(history ?? '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function buildTypingFrames(history: string | null | undefined) {
	const steps = parseRawHistory(history);
	let text = '';
	const frames: string[] = [];

	for (const step of steps) {
		if (!Array.isArray(step) || step.length < 3) {
			continue;
		}

		const operation = step[2];

		if (!operation || typeof operation !== 'object') {
			continue;
		}

		const position =
			typeof Reflect.get(operation, 'p') === 'number'
				? Number(Reflect.get(operation, 'p'))
				: 0;
		const deleteCount =
			typeof Reflect.get(operation, 'd') === 'number'
				? Number(Reflect.get(operation, 'd'))
				: 0;
		const insertedText =
			typeof Reflect.get(operation, 'i') === 'string'
				? String(Reflect.get(operation, 'i'))
				: '';

		if (deleteCount > 0) {
			text = text.slice(0, position) + text.slice(position + deleteCount);
		}

		if (insertedText) {
			text = text.slice(0, position) + insertedText + text.slice(position);
		}

		frames.push(text);
	}

	if (frames.length === 0) {
		return [text];
	}

	return frames;
}

export function decodeComposerText(input: string) {
	return input.replaceAll('\\n', '\n');
}
