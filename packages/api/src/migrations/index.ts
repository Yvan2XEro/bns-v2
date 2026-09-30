import * as migration_20260915_000000_p0_payment_intents from "./20260915_000000_p0_payment_intents";
import * as migration_20260915_000100_p0_reviews_audit from "./20260915_000100_p0_reviews_audit";
import * as migration_20260915_000200_p0_contact_reveal_windows from "./20260915_000200_p0_contact_reveal_windows";
import * as migration_20260922_000000_p1_listing_product from "./20260922_000000_p1_listing_product";
import * as migration_20260923_000000_p1_product_listing from "./20260923_000000_p1_product_listing";
import * as migration_20260924_000000_p1_variant_sku from "./20260924_000000_p1_variant_sku";
import * as migration_20260930_000000_p2_verification_levels from "./20260930_000000_p2_verification_levels";
import * as migration_20260930_000100_p2_verification_data_fixes from "./20260930_000100_p2_verification_data_fixes";

export const migrations = [
	{
		up: migration_20260915_000000_p0_payment_intents.up,
		down: migration_20260915_000000_p0_payment_intents.down,
		name: "20260915_000000_p0_payment_intents",
	},
	{
		up: migration_20260915_000100_p0_reviews_audit.up,
		down: migration_20260915_000100_p0_reviews_audit.down,
		name: "20260915_000100_p0_reviews_audit",
	},
	{
		up: migration_20260915_000200_p0_contact_reveal_windows.up,
		down: migration_20260915_000200_p0_contact_reveal_windows.down,
		name: "20260915_000200_p0_contact_reveal_windows",
	},
	{
		up: migration_20260922_000000_p1_listing_product.up,
		down: migration_20260922_000000_p1_listing_product.down,
		name: "20260922_000000_p1_listing_product",
	},
	{
		up: migration_20260923_000000_p1_product_listing.up,
		down: migration_20260923_000000_p1_product_listing.down,
		name: "20260923_000000_p1_product_listing",
	},
	{
		up: migration_20260924_000000_p1_variant_sku.up,
		down: migration_20260924_000000_p1_variant_sku.down,
		name: "20260924_000000_p1_variant_sku",
	},
	{
		up: migration_20260930_000000_p2_verification_levels.up,
		down: migration_20260930_000000_p2_verification_levels.down,
		name: "20260930_000000_p2_verification_levels",
	},
	{
		up: migration_20260930_000100_p2_verification_data_fixes.up,
		down: migration_20260930_000100_p2_verification_data_fixes.down,
		name: "20260930_000100_p2_verification_data_fixes",
	},
];
