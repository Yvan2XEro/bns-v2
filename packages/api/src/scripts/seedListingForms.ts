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
import { getListingFormPreset } from "../lib/listingFormPreset";
import config from "../payload.config";
import { catchUpCategories } from "../services/categoryCatchUp";

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

	await catchUpCategories(payload, { dryRun, formsOnly });

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
