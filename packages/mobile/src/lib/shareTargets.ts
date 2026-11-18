/**
 * Where a listing or a shop can be shared from the app, and what each
 * destination is given. The card images are drawn by the website
 * (/share/<subject>/<format>); the link carries where it was shared, so the
 * channels that bring visits can be told apart.
 */

export type ShareSubject =
	| { kind: "listing"; id: string; title: string }
	| { kind: "shop"; handle: string; title: string };

export type ShareChannel =
	| "whatsappStatus"
	| "whatsappChat"
	| "instagramStory"
	| "facebookStory"
	| "copyLink"
	| "more";

export type CardFormat = "og" | "story" | "square";

/** The card each channel shares: stories and Status take the 9:16 one. */
export const CHANNEL_CARD: Record<ShareChannel, CardFormat | null> = {
	whatsappStatus: "story",
	whatsappChat: null,
	instagramStory: "story",
	facebookStory: "story",
	copyLink: null,
	more: "square",
};

const UTM: Record<ShareChannel, { source: string; medium: string }> = {
	whatsappStatus: { source: "whatsapp", medium: "status" },
	whatsappChat: { source: "whatsapp", medium: "chat" },
	instagramStory: { source: "instagram", medium: "story" },
	facebookStory: { source: "facebook", medium: "story" },
	copyLink: { source: "copy", medium: "link" },
	more: { source: "share_sheet", medium: "share" },
};

/**
 * The destinations to offer. Instagram and Facebook take a story only from
 * an app that names its Facebook app, so without one they are left out
 * rather than failing once tapped.
 */
export function shareChannels(facebookAppId: string | null): ShareChannel[] {
	return [
		"whatsappStatus",
		"whatsappChat",
		...(facebookAppId ? (["instagramStory", "facebookStory"] as const) : []),
		"copyLink",
		"more",
	];
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

function subjectPath(subject: ShareSubject): string {
	return subject.kind === "listing"
		? `/listing/${encodeURIComponent(subject.id)}`
		: `/s/${encodeURIComponent(subject.handle)}`;
}

/** The page shared, tagged with where it was shared. */
export function shareLink(
	webUrl: string,
	subject: ShareSubject,
	channel: ShareChannel,
): string {
	const { source, medium } = UTM[channel];
	const query = new URLSearchParams({
		utm_source: source,
		utm_medium: medium,
		utm_campaign: `share_${subject.kind}`,
	});
	return `${trimSlash(webUrl)}${subjectPath(subject)}?${query}`;
}

/** The card image the website draws for this subject. */
export function cardImageUrl(
	webUrl: string,
	subject: ShareSubject,
	format: CardFormat,
	lang: "fr" | "en",
): string {
	const path =
		subject.kind === "listing"
			? `/share/listing/${encodeURIComponent(subject.id)}/${format}`
			: `/share/shop/${encodeURIComponent(subject.handle)}/${format}`;
	return `${trimSlash(webUrl)}${path}?lang=${lang}`;
}

/** The text that goes with the share: the title, then the link. */
export function shareMessage(subject: ShareSubject, link: string): string {
	return `${subject.title}\n${link}`;
}
