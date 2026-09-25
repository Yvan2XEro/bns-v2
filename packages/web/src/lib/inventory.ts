import { z } from "zod";
import { optionalAmount } from "./product-form";
import type { PopulatedVariant } from "./shop-api";
import { variantLabel } from "./variants";

export interface InventoryDraft {
	startedAt: string;
	counts: Record<string, string>;
}

const key = (shopId: string) => `bns:inventory:${shopId}`;

function isInventoryDraft(value: unknown): value is InventoryDraft {
	if (typeof value !== "object" || value === null) return false;
	const draft = value as { startedAt?: unknown; counts?: unknown };
	if (typeof draft.startedAt !== "string") return false;
	if (typeof draft.counts !== "object" || draft.counts === null) return false;
	return Object.values(draft.counts).every(
		(entry) => typeof entry === "string",
	);
}

/** Browser storage may be unavailable (private mode, blocked site data): never throw. */
export function loadDraft(shopId: string): InventoryDraft | null {
	try {
		const raw = window.localStorage.getItem(key(shopId));
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		return isInventoryDraft(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function saveDraft(shopId: string, draft: InventoryDraft): void {
	try {
		window.localStorage.setItem(key(shopId), JSON.stringify(draft));
	} catch {
		// The count still works; only "resume later" is lost.
	}
}

export function clearDraft(shopId: string): void {
	try {
		window.localStorage.removeItem(key(shopId));
	} catch {
		// Nothing to clear.
	}
}

export interface CountLine {
	variantId: string;
	expected: number;
	counted: number | null;
	cost: number | null;
}

export interface CountStats {
	counted: number;
	withGap: number;
	missing: number;
	surplus: number;
	costDelta: number;
}

export function countDeltas(lines: CountLine[]): CountStats {
	let counted = 0;
	let withGap = 0;
	let missing = 0;
	let surplus = 0;
	let costDelta = 0;
	for (const line of lines) {
		if (line.counted === null) continue;
		counted++;
		const delta = line.counted - line.expected;
		if (delta !== 0) withGap++;
		if (delta < 0) missing += delta;
		if (delta > 0) surplus += delta;
		costDelta += delta * (line.cost ?? 0);
	}
	return { counted, withGap, missing, surplus, costDelta };
}

export const countFormSchema = z.object({
	rows: z.array(
		z.object({
			variantId: z.string(),
			productTitle: z.string(),
			label: z.string(),
			sku: z.string().nullable(),
			expected: z.number(),
			cost: z.number().nullable(),
			counted: optionalAmount,
		}),
	),
});

export type CountFormState = z.infer<typeof countFormSchema>;
export type CountRow = CountFormState["rows"][number];

/** Tracked variants of the shop, sorted by product, with any saved draft merged in. */
export function rowsFromVariants(
	variants: PopulatedVariant[],
	draft: InventoryDraft,
	defaultLabel: string,
): CountRow[] {
	return variants
		.filter((variant) => variant.trackInventory)
		.map((variant) => ({
			variantId: variant.id,
			productTitle:
				typeof variant.product === "object" ? variant.product.title : "",
			label: variantLabel(variant.optionValues, defaultLabel),
			sku: variant.sku,
			expected: variant.stockOnHand,
			cost: variant.cost ?? null,
			counted: draft.counts[variant.id] ?? "",
		}))
		.sort((a, b) => a.productTitle.localeCompare(b.productTitle));
}

/** The subset of the form worth keeping across a reload: only the rows someone typed into. */
export function draftFromRows(
	startedAt: string,
	rows: CountRow[],
): InventoryDraft {
	const counts: Record<string, string> = {};
	for (const row of rows) {
		if (row.counted.trim() !== "") counts[row.variantId] = row.counted;
	}
	return { startedAt, counts };
}

/**
 * Any row with a non-blank count, valid or not. This is what gates the
 * submit button: a row a seller typed garbage into (a paste, or a physical
 * keyboard ignoring `inputMode="numeric"`) must still let them press submit
 * and find out why, via the form's own validation — never be indistinguishable
 * from an empty screen with nothing to save.
 */
export function hasAnyInput(rows: Pick<CountRow, "counted">[]): boolean {
	return rows.some((row) => row.counted.trim() !== "");
}
