import type { Localized } from "./notificationLocale";

/**
 * Why a moderator refuses a listing, as a code each client translates, so a
 * seller reads the reason in their own language whoever moderated it. The
 * moderator's own words travel beside it (`rejectionReason`), optional except
 * for `other`.
 */
export const LISTING_REJECTION_REASONS = [
	"prohibited_item",
	"misleading",
	"wrong_category",
	"poor_photos",
	"missing_details",
	"price_issue",
	"duplicate",
	"contact_details",
	"offensive",
	"suspected_scam",
	"other",
] as const;
export type ListingRejectionReason = (typeof LISTING_REJECTION_REASONS)[number];

export function isListingRejectionReason(
	value: unknown,
): value is ListingRejectionReason {
	return (
		typeof value === "string" &&
		(LISTING_REJECTION_REASONS as readonly string[]).includes(value)
	);
}

/** `other` says nothing by itself: the moderator must write the reason. */
export function rejectionNeedsMessage(code: ListingRejectionReason): boolean {
	return code === "other";
}

/**
 * The reasons as notifications word them. The apps word them from their own
 * catalogues (`ListingRejection` on web, `listingRejection` on mobile); a
 * notification is written by the server, so it carries its own copy.
 */
export const LISTING_REJECTION_LABELS: Record<
	ListingRejectionReason,
	Localized
> = {
	prohibited_item: {
		fr: "article interdit sur la plateforme",
		en: "item not allowed on the platform",
	},
	misleading: {
		fr: "annonce trompeuse",
		en: "misleading listing",
	},
	wrong_category: {
		fr: "mauvaise catégorie",
		en: "wrong category",
	},
	poor_photos: {
		fr: "photos absentes, floues ou sans rapport",
		en: "photos missing, blurry or unrelated",
	},
	missing_details: {
		fr: "description incomplète",
		en: "incomplete description",
	},
	price_issue: {
		fr: "prix manquant ou irréaliste",
		en: "price missing or unrealistic",
	},
	duplicate: {
		fr: "annonce en double",
		en: "duplicate listing",
	},
	contact_details: {
		fr: "coordonnées dans le texte ou les photos",
		en: "contact details in the text or photos",
	},
	offensive: {
		fr: "contenu choquant ou injurieux",
		en: "offensive content",
	},
	suspected_scam: {
		fr: "suspicion d'arnaque",
		en: "suspected scam",
	},
	other: {
		fr: "autre motif",
		en: "other reason",
	},
};

/**
 * What a seller is shown about a refusal: the coded reason, to word in their
 * language, and the moderator's own words. A listing refused before reasons
 * were coded has only the words.
 */
export function listingRejectionOf(listing: {
	rejectionCode?: unknown;
	rejectionReason?: string | null;
}): { code: ListingRejectionReason | null; message: string | null } {
	const message = listing.rejectionReason?.trim() || null;
	return {
		code: isListingRejectionReason(listing.rejectionCode)
			? listing.rejectionCode
			: null,
		message,
	};
}

/** "Wrong category — move it to Phones", in the reader's words for the code. */
export function rejectionText(
	listing: { rejectionCode?: unknown; rejectionReason?: string | null },
	reasonLabel: (code: ListingRejectionReason) => string,
): string | null {
	const { code, message } = listingRejectionOf(listing);
	const parts = [code ? reasonLabel(code) : null, message].filter(
		(part): part is string => Boolean(part),
	);
	return parts.length > 0 ? parts.join(" — ") : null;
}
