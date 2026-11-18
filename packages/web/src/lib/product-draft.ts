import { emptyState, type ProductFormState } from "./product-form";

/**
 * A new product's form, kept on this device while it is being written. Photos
 * not yet uploaded are files, which storage cannot hold: they are left out,
 * and the editor says so.
 */
export interface ProductDraft {
	savedAt: string;
	state: Omit<ProductFormState, "newImages">;
}

const key = (shopId: string) => `bns:product-draft:${shopId}`;

/**
 * Takes each stored field only when it has the shape a fresh form has, so a
 * draft written by an older version of the editor can never break it.
 */
export function restoreDraft(raw: unknown): ProductDraft | null {
	if (typeof raw !== "object" || raw === null) return null;
	const { savedAt, state } = raw as { savedAt?: unknown; state?: unknown };
	if (typeof savedAt !== "string" || typeof state !== "object" || !state)
		return null;
	const base = emptyState();
	const stored = state as Record<string, unknown>;
	const merged: Record<string, unknown> = { ...base };
	for (const [field, fallback] of Object.entries(base)) {
		const value = stored[field];
		if (field === "newImages" || value === undefined) continue;
		const sameShape = Array.isArray(fallback)
			? Array.isArray(value)
			: fallback === null || typeof fallback === "string"
				? value === null || typeof value === "string"
				: typeof value === typeof fallback && value !== null;
		if (sameShape) merged[field] = value;
	}
	const { newImages: _files, ...rest } = merged as ProductFormState;
	return { savedAt, state: rest };
}

/** Browser storage may be unavailable (private mode, blocked site data): never throw. */
export function loadProductDraft(shopId: string): ProductDraft | null {
	try {
		const raw = window.localStorage.getItem(key(shopId));
		return raw ? restoreDraft(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

export function saveProductDraft(
	shopId: string,
	state: ProductFormState,
	now = new Date(),
): ProductDraft | null {
	const { newImages: _files, ...rest } = state;
	const draft: ProductDraft = { savedAt: now.toISOString(), state: rest };
	try {
		window.localStorage.setItem(key(shopId), JSON.stringify(draft));
		return draft;
	} catch {
		return null;
	}
}

export function clearProductDraft(shopId: string): void {
	try {
		window.localStorage.removeItem(key(shopId));
	} catch {
		// Nothing to clear.
	}
}
