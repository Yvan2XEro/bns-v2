/**
 * The share images, one design in three shapes — what each destination
 * shows without cropping:
 *
 * - `og` 1200×630 (1.91:1): the link preview of WhatsApp chats, Facebook,
 *   LinkedIn, X and Telegram. Kept under 300 KB: WhatsApp silently drops a
 *   heavier preview, though Meta documents 600 KB.
 * - `story` 1080×1920 (9:16): WhatsApp Status, Instagram, Facebook and TikTok
 *   stories. Their buttons cover about 250 px at the top and the bottom, so
 *   nothing that matters is drawn there.
 * - `square` 1080×1080: a feed post (Instagram, Facebook).
 */
export const CARD_FORMATS = {
	og: { width: 1200, height: 630, maxBytes: 300_000 },
	story: { width: 1080, height: 1920, maxBytes: 1_500_000 },
	square: { width: 1080, height: 1080, maxBytes: 1_000_000 },
} as const;

export type CardFormat = keyof typeof CARD_FORMATS;

export function isCardFormat(value: string): value is CardFormat {
	return Object.hasOwn(CARD_FORMATS, value);
}

/** Room left at the top and the bottom of a story for the app's buttons. */
export const STORY_SAFE_MARGIN = 260;

export type CardSubject =
	| { kind: "listing"; id: string }
	| { kind: "shop"; handle: string };

/**
 * A card's URL. `version` (the subject's last update) changes the URL when
 * the subject does, so the image can be cached for long.
 */
export function cardPath(
	subject: CardSubject,
	format: CardFormat,
	version?: string | null,
): string {
	const base =
		subject.kind === "listing"
			? `/share/listing/${encodeURIComponent(subject.id)}/${format}`
			: `/share/shop/${encodeURIComponent(subject.handle)}/${format}`;
	return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}

/**
 * What the card's font (DM Sans) can draw: Latin letters with their accents
 * and the usual punctuation. Anything else — an emoji in a title, another
 * script — would make the renderer fetch a font from the network at every
 * card, and fail without one; it is dropped instead.
 */
const DRAWABLE =
	/[^\u0020-\u024f\u2010-\u2027\u2030-\u203a\u20ac\u2190-\u2193]/gu;

export function drawable(text: string): string {
	return text
		.replace(/[\u00a0\u202f\u2007]/g, " ")
		.replace(DRAWABLE, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Text cut at a word, with an ellipsis, so it fits the lines it is given. */
export function clip(text: string, max: number): string {
	const clean = drawable(text);
	if (clean.length <= max) return clean;
	const cut = clean.slice(0, max - 1);
	const atWord = cut.lastIndexOf(" ");
	return `${(atWord > max * 0.6 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

/** A link printed on a card: no scheme, no "www." — shorter, still typeable. */
export function displayUrl(url: string): string {
	return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
}
