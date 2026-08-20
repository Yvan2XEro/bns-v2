/**
 * Brings an already-seeded category tree up to date with `seed/seedCategories.ts`.
 *
 * **This is not needed for a fresh install.** `bun run seed` now writes the
 * `listingForm` group and the full attribute list itself, so a freshly seeded
 * database is complete after one command. This script exists for the other
 * case: a database that was seeded *before* those fields existed — production —
 * where the categories are already there, carry real listings, and must not be
 * wiped to gain the new configuration.
 *
 * It reads its values straight from the seed definitions, so the two can never
 * disagree: change `seedCategories.ts` and this script follows.
 *
 * Two rules it never breaks:
 *   - **Idempotent.** Running it twice changes nothing the second time.
 *   - **Never overwrites a human.** A listing-form field is written only while
 *     it is still unset — absent, null, empty or "auto". An attribute is only
 *     ever *appended*, never edited, reordered or removed: if a slug is already
 *     on the category, whatever the admin made of it stays untouched. Anything
 *     chosen in the admin panel survives every run.
 *
 * Only a handful of categories carry a `listingForm`: the settings are
 * inherited down the tree, so one on `vehicles` covers cars, motorcycles and
 * trucks, and one on `real-estate` covers apartments, houses, commercial
 * property and land. Attributes, by contrast, are *not* inherited — every
 * category owns its list — so the attribute pass visits all of them.
 *
 * Usage (from packages/api):
 *   bun run src/scripts/seedListingForms.ts --dry-run    # print the plan only
 *   bun run src/scripts/seedListingForms.ts              # apply it
 *   bun run src/scripts/seedListingForms.ts --forms-only # skip the attributes
 *
 * `--dry-run` reports exactly what would change and writes nothing.
 */

import { getPayload } from "payload";
import {
	type CategoryListingFormConfig,
	getListingFormPreset,
} from "../lib/listingFormPreset";
import config from "../payload.config";
import {
	type CategoryAttributeSeed,
	categoryListingForms,
	categorySeedAttributes,
} from "../seed/seedCategories";

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
	take("condition");
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

	const missing = proposed.filter((attribute) => !known.has(attribute.slug));
	if (missing.length === 0) return null;

	return {
		next: [...existing, ...missing],
		added: missing.map((attribute) => attribute.slug),
	};
}

async function main() {
	const dryRun =
		process.argv.includes("--dry-run") || process.argv.includes("-n");
	const formsOnly = process.argv.includes("--forms-only");

	const payload = await getPayload({ config });

	console.log(
		dryRun
			? "\n=== Category catch-up (DRY RUN — nothing will be written) ===\n"
			: "\n=== Category catch-up ===\n",
	);

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

		const category = found.docs[0] as StoredCategory | undefined;

		if (!category) {
			missing += 1;
			console.log(`?  ${slug} — no such category, skipped`);
			continue;
		}

		const proposedForm = categoryListingForms[slug];
		const formPlan = proposedForm
			? planListingForm(category.listingForm, proposedForm)
			: null;

		const proposedAttributes = formsOnly
			? []
			: (categorySeedAttributes[slug] ?? []);
		const attributePlan = planAttributes(
			category.attributes,
			proposedAttributes,
		);

		if (!formPlan && !attributePlan) {
			skipped += 1;
			console.log(`=  ${slug} — already up to date, left untouched`);
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
			console.log(`+  ${slug} — would set ${changes.join(" | ")}`);
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
		console.log(`+  ${slug} — set ${changes.join(" | ")}`);
	}

	console.log(
		`\n${dryRun ? "Would update" : "Updated"} ${written}, left ${skipped} untouched, ${missing} not found.\n`,
	);

	await report(payload);
}

/**
 * Prints how every active category now resolves, inheritance included, so the
 * result can be eyeballed rather than trusted. `depth: 2` populates the parent
 * chain the resolver walks.
 */
async function report(payload: Awaited<ReturnType<typeof getPayload>>) {
	const all = await payload.find({
		collection: "categories",
		depth: 2,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});

	console.log("=== Resolved listing form, per category ===\n");
	console.log(
		"slug                     type      price      condition  photos     attrs",
	);

	const rows = [...all.docs].sort((a, b) =>
		String(a.slug).localeCompare(String(b.slug)),
	);

	const describe = (field: { enabled: boolean; required: boolean }) =>
		field.enabled ? (field.required ? "required" : "optional") : "hidden";

	for (const category of rows) {
		const preset = getListingFormPreset(category);
		const attributeCount = Array.isArray(category.attributes)
			? category.attributes.length
			: 0;

		console.log(
			`${String(category.slug).padEnd(24)} ${preset.categoryType.padEnd(9)} ${describe(
				preset.fields.price,
			).padEnd(10)} ${describe(preset.fields.condition).padEnd(10)} ${describe(
				preset.fields.photos,
			).padEnd(10)} ${attributeCount}`,
		);
	}

	console.log("");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Category catch-up failed:", error);
		process.exit(1);
	});
