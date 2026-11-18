export interface Segment {
	text: string;
	match: boolean;
}

const fold = (value: string) =>
	value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Splits `text` into plain and matching runs for each word of `query`,
 * ignoring case and accents ("telephone" marks "Téléphones"). Words under
 * two characters are not highlighted.
 */
export function highlightSegments(text: string, query: string): Segment[] {
	const words = Array.from(
		new Set(
			fold(query)
				.split(/\s+/)
				.filter((word) => word.length >= 2),
		),
	);
	if (!text || words.length === 0) return text ? [{ text, match: false }] : [];

	// Folding can change a character's length, so keep each folded char's source index.
	let folded = "";
	const origin: { start: number; end: number }[] = [];
	let offset = 0;
	for (const char of text) {
		for (const unit of fold(char)) {
			folded += unit;
			origin.push({ start: offset, end: offset + char.length });
		}
		offset += char.length;
	}

	const marked = new Array<boolean>(text.length).fill(false);
	for (const word of words) {
		let from = folded.indexOf(word);
		while (from !== -1) {
			marked.fill(true, origin[from].start, origin[from + word.length - 1].end);
			from = folded.indexOf(word, from + word.length);
		}
	}

	const segments: Segment[] = [];
	for (let i = 0; i < text.length; i++) {
		const last = segments.at(-1);
		if (last && last.match === marked[i]) last.text += text[i];
		else segments.push({ text: text[i], match: marked[i] });
	}
	return segments;
}

/**
 * A one-line excerpt that keeps the first match in view: a description whose
 * match sits past `lead` characters is cut to start a few words before it.
 */
export function excerptAround(text: string, query: string, lead = 40): string {
	const segments = highlightSegments(text, query);
	let index = 0;
	for (const segment of segments) {
		if (segment.match) break;
		index += segment.text.length;
	}
	if (index >= text.length || index <= lead) return text;
	const cut = text.lastIndexOf(" ", index - Math.floor(lead / 2));
	return `…${text.slice(cut === -1 ? index : cut + 1)}`;
}
