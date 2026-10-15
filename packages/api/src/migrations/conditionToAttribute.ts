import { ObjectId } from "mongodb";
import type { Payload } from "payload";
import {
	CONDITION_LABELS_FR,
	CONDITION_SLUG,
	CONDITION_VALUES,
	type ConditionValue,
	conditionAttributeOf,
	normalizeWord,
} from "../contracts/conditionAttribute";
import { getListingCategoryType } from "../lib/listingFormPreset";
import {
	type CategoryRow,
	chainOf,
	loadCategoryRows,
	nestedCategory,
	raw,
} from "./tagsCategoryScope";

type Rec = Record<string, unknown>;
type Mode = "hidden" | "optional" | "required";

const rowId = () => new ObjectId().toHexString();

const isMode = (value: unknown): value is Mode =>
	value === "hidden" || value === "optional" || value === "required";

const PRESET_TYPES = new Set([
	"product",
	"service",
	"job",
	"rental",
	"generic",
]);

/**
 * How the retired built-in condition field behaved for a category, frozen as
 * `listingFormPreset` resolved it: the nearest explicit mode, unless a nearer
 * category names a preset first; the preset shows it (optional) for goods only.
 */
export function legacyConditionMode(chain: readonly CategoryRow[]): Mode {
	for (const node of chain) {
		const mode = node.listingForm?.condition;
		if (isMode(mode)) return mode;
		if (PRESET_TYPES.has(String(node.listingForm?.type))) break;
	}
	return getListingCategoryType(nestedCategory(chain)) === "product"
		? "optional"
		: "hidden";
}

/** The attribute added where a category showed the field and had none of its own. */
export function conditionAttributeRow(required: boolean): Rec {
	return {
		id: rowId(),
		name: "État",
		slug: CONDITION_SLUG,
		type: "select",
		required,
		filterable: true,
		options: CONDITION_VALUES.map((value) => ({
			id: rowId(),
			value,
			label: CONDITION_LABELS_FR[value],
		})),
	};
}

const SYNONYMS: Record<ConditionValue, readonly string[]> = {
	new: ["new", "neuf", "neuve", "nouveau", "brand new"],
	like_new: [
		"like new",
		"comme neuf",
		"comme neuve",
		"tres bon etat",
		"excellent",
		"excellent etat",
	],
	good: ["good", "bon", "bon etat", "good condition"],
	fair: [
		"fair",
		"correct",
		"etat correct",
		"acceptable",
		"moyen",
		"etat moyen",
	],
	poor: ["poor", "use", "usee", "mauvais", "mauvais etat", "pour pieces"],
};

interface Target {
	slug: string;
	/** The category's condition-like attribute; null for an orphaned value. */
	def: Rec | null;
	category: CategoryRow | null;
}

export interface ConditionReport {
	attributesAdded: number;
	attributesReused: number;
	optionsAppended: number;
	listingsCopied: number;
	productsCopied: number;
	/** The item already had a value under the condition-like slug; it wins. */
	keptExistingValue: number;
	/** Copied under `condition` though the category no longer asks for it. */
	orphaned: number;
	categoriesCleared: number;
}

/**
 * Moves the built-in condition onto category attributes, losing no value:
 *   1. every category whose form showed the field gets a `condition` select
 *      (« État »), unless it already has a condition-like attribute;
 *   2. every listing's and product's `condition` is copied into its
 *      attributes under that slug, mapped onto the existing options, and the
 *      field is removed;
 *   3. `listingForm.condition` is removed from every category.
 * Idempotent: a second run finds nothing left to move.
 */
export async function migrateConditionToAttribute(
	payload: Payload,
): Promise<ConditionReport> {
	const report: ConditionReport = {
		attributesAdded: 0,
		attributesReused: 0,
		optionsAppended: 0,
		listingsCopied: 0,
		productsCopied: 0,
		keptExistingValue: 0,
		orphaned: 0,
		categoriesCleared: 0,
	};
	const rows = await loadCategoryRows(payload);
	const dirty = new Set<CategoryRow>();
	const targets = new Map<string, Target>();

	for (const row of rows.values()) {
		const mode = legacyConditionMode(chainOf(rows, row.id));
		if (mode === "hidden") continue;
		const existing = conditionAttributeOf(row.attributes);
		if (existing && typeof existing.slug === "string") {
			targets.set(row.id, {
				slug: existing.slug,
				def: existing,
				category: row,
			});
			report.attributesReused += 1;
			continue;
		}
		const added = conditionAttributeRow(mode === "required");
		row.attributes = [added, ...row.attributes];
		dirty.add(row);
		targets.set(row.id, { slug: CONDITION_SLUG, def: added, category: row });
		report.attributesAdded += 1;
	}

	const valueFor = (code: string, target: Target): string => {
		const def = target.def;
		if (!def) return code;
		if (def.type !== "select") {
			return CONDITION_LABELS_FR[code as ConditionValue] ?? code;
		}
		const options = Array.isArray(def.options) ? (def.options as Rec[]) : [];
		const words = SYNONYMS[code as ConditionValue] ?? [];
		const match =
			options.find((option) => option.value === code) ??
			options.find(
				(option) =>
					words.includes(normalizeWord(option.value)) ||
					words.includes(normalizeWord(option.label)),
			);
		if (match && typeof match.value === "string") return match.value;
		def.options = [
			...options,
			{
				id: rowId(),
				value: code,
				label: CONDITION_LABELS_FR[code as ConditionValue] ?? code,
			},
		];
		if (target.category) dirty.add(target.category);
		report.optionsAppended += 1;
		return code;
	};

	const moveItems = async (slug: "listings" | "products") => {
		const collection = raw(payload, slug);
		let copied = 0;
		for await (const doc of collection.find(
			{ condition: { $exists: true } },
			{ projection: { condition: 1, category: 1, attributes: 1 } },
		)) {
			const filter = { _id: doc._id ?? doc.id };
			const code = typeof doc.condition === "string" ? doc.condition : "";
			if (!code) {
				await collection.updateOne(filter, { $unset: { condition: "" } });
				continue;
			}
			const categoryId = doc.category == null ? "" : String(doc.category);
			const target = targets.get(categoryId) ?? {
				slug: CONDITION_SLUG,
				def: null,
				category: null,
			};
			const attributes =
				doc.attributes &&
				typeof doc.attributes === "object" &&
				!Array.isArray(doc.attributes)
					? { ...(doc.attributes as Rec) }
					: {};
			const current = attributes[target.slug];
			if (current !== undefined && current !== null && current !== "") {
				report.keptExistingValue += 1;
			} else {
				attributes[target.slug] = valueFor(code, target);
				if (!target.def) report.orphaned += 1;
				copied += 1;
			}
			await collection.updateOne(filter, {
				$set: { attributes },
				$unset: { condition: "" },
			});
		}
		return copied;
	};

	report.listingsCopied = await moveItems("listings");
	report.productsCopied = await moveItems("products");

	const categories = raw(payload, "categories");
	for (const row of rows.values()) {
		const hasMode =
			row.listingForm !== null && "condition" in (row.listingForm ?? {});
		if (!dirty.has(row) && !hasMode) continue;
		await categories.updateOne(
			{ _id: row._id },
			{
				...(dirty.has(row) ? { $set: { attributes: row.attributes } } : {}),
				...(hasMode ? { $unset: { "listingForm.condition": "" } } : {}),
			},
		);
		if (hasMode) report.categoriesCleared += 1;
	}

	return report;
}
