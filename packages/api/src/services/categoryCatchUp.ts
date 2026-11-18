import type { Payload } from "payload";
import { isConditionLikeAttribute } from "../contracts/conditionAttribute";
import { fingerprintOf } from "../lib/deployTasks";
import type { CategoryListingFormConfig } from "../lib/listingFormPreset";
import { localizeCategoryLabels } from "../seed/categoryLocales";
import {
	frenchSeedAttribute,
	seedFrenchOfEnglish,
	seedLabelFr,
} from "../seed/categoryTranslations";
import {
	type CategoryAttributeSeed,
	categoryListingForms,
	categorySeedAttributes,
} from "../seed/seedCategories";

/**
 * Brings an already-seeded category tree up to date with `seed/seedCategories.ts`
 * without wiping what an admin made of it. Two rules it never breaks:
 *   - **Idempotent.** Running it twice changes nothing the second time.
 *   - **Never overwrites a human.** A listing-form field is written only while
 *     it is still unset — absent, null, empty or "auto". An attribute is only
 *     ever *appended*, never edited, reordered or removed.
 *
 * Run at API boot by the deploy tasks whenever the seed definitions change
 * (see `categoryCatchUpFingerprint`), and by hand through
 * `scripts/seedListingForms.ts` for a dry run.
 */

/** Changes whenever the seed's listing forms or attributes do. */
export function categoryCatchUpFingerprint(): string {
	return fingerprintOf({ categoryListingForms, categorySeedAttributes });
}

const hasUnnamedRow = (rows: StoredAttribute[] | null | undefined) =>
	(rows ?? []).some((row) => typeof row?.name !== "string" || !row.name.trim());

/** A stored value counts as unset when it is absent, null, empty or "auto". */
const isUnset = (value: unknown): boolean =>
	value === undefined || value === null || value === "" || value === "auto";

type StoredAttribute = Partial<CategoryAttributeSeed> & {
	id?: string | null;
};

type StoredCategory = {
	id: string;
	slug?: string | null;
	name?: string | null;
	listingForm?: CategoryListingFormConfig | null;
	attributes?: StoredAttribute[] | null;
};

/**
 * Returns the group to save, or `null` when every proposed key already carries
 * a value. Existing keys are copied through untouched, so a partial write can
 * never clear a sibling the admin set.
 */
function planListingForm(
	current: CategoryListingFormConfig | null | undefined,
	proposed: CategoryListingFormConfig,
): { next: CategoryListingFormConfig; applied: string[] } | null {
	const next: CategoryListingFormConfig = { ...(current ?? {}) };
	const applied: string[] = [];

	const take = <K extends keyof CategoryListingFormConfig>(key: K) => {
		const value = proposed[key];
		if (value === undefined || value === null) return;
		if (!isUnset(current?.[key])) return;
		next[key] = value;
		applied.push(`${key}=${String(value)}`);
	};

	take("type");
	take("price");
	take("photos");
	take("priceLabel");

	return applied.length > 0 ? { next, applied } : null;
}

/**
 * Returns the attribute array to save, or `null` when the category already
 * knows every slug the seed defines.
 *
 * Missing attributes are appended after the existing ones rather than merged
 * into seed order: the array order is the form's display order, and an admin
 * who dragged a row into place should not have it moved back. A slug that is
 * already present is left exactly as stored, whatever its type, options or
 * wording have become.
 */
function planAttributes(
	current: StoredAttribute[] | null | undefined,
	proposed: CategoryAttributeSeed[],
): { next: StoredAttribute[]; added: string[] } | null {
	const existing = Array.isArray(current) ? current : [];
	const known = new Set(
		existing
			.map((attribute) => attribute?.slug)
			.filter((slug): slug is string => typeof slug === "string"),
	);

	// Where condition is asked is the condition migration's call, and an
	// admin who removed it from a category must not see it come back.
	const missing = proposed.filter(
		(attribute) =>
			!known.has(attribute.slug) && !isConditionLikeAttribute(attribute),
	);
	if (missing.length === 0) return null;

	return {
		next: [...existing, ...missing],
		added: missing.map((attribute) => attribute.slug),
	};
}

/**
 * The stored rows as written back in the default locale: a row whose French
 * label is missing — one created in the en admin locale — gets the seed's
 * French for an English seed word, its English otherwise, so the required
 * French name never fails the update and the boot task never loops on it.
 */
export function withFrenchLabels(
	rows: StoredAttribute[],
	english: Map<string, StoredAttribute>,
): StoredAttribute[] {
	return rows.map((row) => {
		const en = row?.id ? english.get(row.id) : undefined;
		if (!en) return row;
		const fill = (
			field: "name" | "group" | "unit",
			kind: "attribute" | "group" | "unit",
		) => {
			const current = row[field];
			const fallback = en[field];
			if (typeof current === "string" && current.trim()) return {};
			if (typeof fallback !== "string" || !fallback.trim()) return {};
			return { [field]: seedFrenchOfEnglish(kind, fallback) ?? fallback };
		};
		return {
			...row,
			...fill("name", "attribute"),
			...fill("group", "group"),
			...fill("unit", "unit"),
		};
	});
}

export async function catchUpCategories(
	payload: Payload,
	options: {
		dryRun?: boolean;
		formsOnly?: boolean;
		log?: (line: string) => void;
	} = {},
): Promise<{ written: number; skipped: number; missing: number }> {
	const dryRun = options.dryRun === true;
	const formsOnly = options.formsOnly === true;
	const log = options.log ?? console.log;

	// Listing-form slugs first, in seed order, then every remaining category
	// that has attributes to check.
	const slugs = [
		...Object.keys(categoryListingForms),
		...Object.keys(categorySeedAttributes).filter(
			(slug) => !(slug in categoryListingForms),
		),
	];

	let written = 0;
	let skipped = 0;
	let missing = 0;

	for (const slug of slugs) {
		const found = await payload.find({
			collection: "categories",
			where: { slug: { equals: slug } },
			depth: 0,
			limit: 1,
			overrideAccess: true,
		});

		let category = found.docs[0] as StoredCategory | undefined;
		if (category && !formsOnly && hasUnnamedRow(category.attributes)) {
			const inEnglish = (await payload.findByID({
				collection: "categories",
				id: category.id,
				depth: 0,
				locale: "en",
				fallbackLocale: false,
				overrideAccess: true,
			})) as StoredCategory;
			category = {
				...category,
				attributes: withFrenchLabels(
					category.attributes ?? [],
					new Map(
						(inEnglish.attributes ?? [])
							.filter((row) => row?.id)
							.map((row) => [row.id as string, row]),
					),
				),
			};
		}

		if (!category) {
			missing += 1;
			log(`?  ${slug} — no such category, skipped`);
			continue;
		}

		const seedForm = categoryListingForms[slug];
		// Written in the default locale, so in French; the English follows below.
		const proposedForm = seedForm?.priceLabel
			? {
					...seedForm,
					priceLabel: seedLabelFr("priceLabel", seedForm.priceLabel),
				}
			: seedForm;
		const formPlan = proposedForm
			? planListingForm(category.listingForm, proposedForm)
			: null;

		const proposedAttributes = formsOnly
			? []
			: (categorySeedAttributes[slug] ?? []).map(frenchSeedAttribute);
		const attributePlan = planAttributes(
			category.attributes,
			proposedAttributes,
		);

		if (!formPlan && !attributePlan) {
			skipped += 1;
			log(`=  ${slug} — already up to date, left untouched`);
			continue;
		}

		const changes: string[] = [];
		if (formPlan) changes.push(`form: ${formPlan.applied.join(", ")}`);
		if (attributePlan) {
			changes.push(
				`+${attributePlan.added.length} attribute(s): ${attributePlan.added.join(", ")}`,
			);
		}

		if (dryRun) {
			written += 1;
			log(`+  ${slug} — would set ${changes.join(" | ")}`);
			continue;
		}

		await payload.update({
			collection: "categories",
			id: category.id,
			data: {
				...(formPlan ? { listingForm: formPlan.next } : {}),
				...(attributePlan ? { attributes: attributePlan.next } : {}),
			},
			overrideAccess: true,
		});

		written += 1;
		log(`+  ${slug} — set ${changes.join(" | ")}`);
	}

	if (!dryRun && written > 0) await localizeCategoryLabels(payload);

	log(
		`\n${dryRun ? "Would update" : "Updated"} ${written}, left ${skipped} untouched, ${missing} not found.\n`,
	);

	return { written, skipped, missing };
}
