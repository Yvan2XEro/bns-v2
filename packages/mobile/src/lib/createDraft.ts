import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The listing being written, kept on the phone: Android killing the app, a
 * call or a flat battery must not cost the seller their ad. Versioned so a
 * shape change drops old drafts instead of loading them half-right.
 */
const DRAFT_VERSION = 1;

export function createDraftKey(userId: string): string {
	return `bns.createDraft.v${DRAFT_VERSION}.${userId}`;
}

/** Anything the seller would be sorry to lose. */
export function isDraftWorthKeeping(form: {
	title: string;
	description: string;
	category: unknown;
	price: string;
	images: unknown[];
	tags: unknown[];
}): boolean {
	return Boolean(
		form.title.trim() ||
			form.description.trim() ||
			form.category ||
			form.price ||
			form.images.length > 0 ||
			form.tags.length > 0,
	);
}

export async function loadCreateDraft<T>(userId: string): Promise<T | null> {
	try {
		const raw = await AsyncStorage.getItem(createDraftKey(userId));
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export async function saveCreateDraft(userId: string, form: unknown) {
	try {
		await AsyncStorage.setItem(createDraftKey(userId), JSON.stringify(form));
	} catch {
		// Storage full or unavailable: the draft lives in memory as before.
	}
}

export async function clearCreateDraft(userId: string) {
	try {
		await AsyncStorage.removeItem(createDraftKey(userId));
	} catch {
		// Nothing to undo.
	}
}
