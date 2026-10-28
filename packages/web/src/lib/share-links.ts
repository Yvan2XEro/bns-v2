import { whatsappShareUrl } from "../../../api/src/contracts/whatsapp";
import type { CardSubject } from "./share-card/formats";

/** Where a listing or a shop is shared from the website. */
export type WebShareChannel =
	| "files"
	| "whatsapp"
	| "facebook"
	| "x"
	| "linkedin"
	| "copy"
	| "download";

const UTM: Record<WebShareChannel, { source: string; medium: string }> = {
	files: { source: "share_sheet", medium: "share" },
	whatsapp: { source: "whatsapp", medium: "chat" },
	facebook: { source: "facebook", medium: "post" },
	x: { source: "x", medium: "post" },
	linkedin: { source: "linkedin", medium: "post" },
	copy: { source: "copy", medium: "link" },
	download: { source: "card", medium: "image" },
};

function subjectPath(subject: CardSubject): string {
	return subject.kind === "listing"
		? `/listing/${encodeURIComponent(subject.id)}`
		: `/s/${encodeURIComponent(subject.handle)}`;
}

/** The page shared, tagged with where it was shared (as the app does). */
export function webShareLink(
	origin: string,
	subject: CardSubject,
	channel: WebShareChannel,
): string {
	const { source, medium } = UTM[channel];
	const query = new URLSearchParams({
		utm_source: source,
		utm_medium: medium,
		utm_campaign: `share_${subject.kind}`,
	});
	return `${origin.replace(/\/+$/, "")}${subjectPath(subject)}?${query}`;
}

/**
 * Each network's own share address: it opens a post (or a chat) with the
 * link, whose preview is the generated card.
 */
export function networkShareUrl(
	network: "whatsapp" | "facebook" | "x" | "linkedin",
	link: string,
	text: string,
): string {
	switch (network) {
		case "whatsapp":
			return whatsappShareUrl(`${text}\n${link}`);
		case "facebook":
			return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
		case "x":
			return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
		case "linkedin":
			return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
	}
}

/** A downloaded card's file name: readable, and saying what it shows. */
export function cardFileName(
	subject: CardSubject,
	format: "story" | "square",
): string {
	const who = subject.kind === "listing" ? subject.id : subject.handle;
	return `buynsellem-${subject.kind}-${who}-${format}.jpg`.replace(
		/[^\w.-]/g,
		"_",
	);
}
