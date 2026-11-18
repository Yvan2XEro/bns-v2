/**
 * The listing being written, kept in this browser: a closed tab or a crash
 * no longer costs the seller what they typed. Photos are files the browser
 * cannot keep, so they are picked again.
 */
export interface ListingDraft {
	categoryId: string | null;
	title: string;
	description: string;
	price: string;
	location: string;
	duration: string;
	attributeValues: Record<string, string>;
	tags: string[];
}

export const LISTING_DRAFT_KEY = "bns.createListingDraft.v1";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** `localStorage`, read lazily: it throws in some private windows. */
const browserStorage = (): DraftStorage => window.localStorage;

export function isListingDraftWorthKeeping(draft: ListingDraft): boolean {
	return Boolean(
		draft.title.trim() ||
			draft.description.trim() ||
			draft.price ||
			draft.categoryId ||
			draft.tags.length > 0,
	);
}

export function loadListingDraft(
	storage: () => DraftStorage = browserStorage,
): ListingDraft | null {
	try {
		const raw = storage().getItem(LISTING_DRAFT_KEY);
		if (!raw) return null;
		const draft = JSON.parse(raw) as ListingDraft;
		return isListingDraftWorthKeeping(draft) ? draft : null;
	} catch {
		return null;
	}
}

export function saveListingDraft(
	draft: ListingDraft,
	storage: () => DraftStorage = browserStorage,
) {
	try {
		if (isListingDraftWorthKeeping(draft))
			storage().setItem(LISTING_DRAFT_KEY, JSON.stringify(draft));
		else storage().removeItem(LISTING_DRAFT_KEY);
	} catch {
		// Private window or full storage: the draft stays in memory only.
	}
}

export function clearListingDraft(
	storage: () => DraftStorage = browserStorage,
) {
	try {
		storage().removeItem(LISTING_DRAFT_KEY);
	} catch {
		// Nothing to clear.
	}
}
