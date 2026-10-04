import * as migration_20260915_000000_p0_payment_intents from "./20260915_000000_p0_payment_intents";
import * as migration_20260915_000100_p0_reviews_audit from "./20260915_000100_p0_reviews_audit";
import * as migration_20260915_000200_p0_contact_reveal_windows from "./20260915_000200_p0_contact_reveal_windows";
import * as migration_20260922_000000_p1_listing_product from "./20260922_000000_p1_listing_product";
import * as migration_20260923_000000_p1_product_listing from "./20260923_000000_p1_product_listing";
import * as migration_20260924_000000_p1_variant_sku from "./20260924_000000_p1_variant_sku";
import * as migration_20260930_000000_p2_verification_levels from "./20260930_000000_p2_verification_levels";
import * as migration_20260930_000100_p2_verification_data_fixes from "./20260930_000100_p2_verification_data_fixes";
import * as migration_20261001_000000_p3_invitation_pending_key from "./20261001_000000_p3_invitation_pending_key";
import * as migration_20261001_000100_p3_shop_listing_seller from "./20261001_000100_p3_shop_listing_seller";
import * as migration_20261001_000200_p3_shop_member_defaults from "./20261001_000200_p3_shop_member_defaults";
import * as migration_20261002_000000_p4_order_indexes from "./20261002_000000_p4_order_indexes";
import * as migration_20261002_000100_p4_review_shop_index from "./20261002_000100_p4_review_shop_index";
import * as migration_20261003_000000_p5_invoice_indexes from "./20261003_000000_p5_invoice_indexes";
import * as migration_20261004_000000_p6_case_indexes from "./20261004_000000_p6_case_indexes";

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
	{
		up: migration_20261001_000100_p3_shop_listing_seller.up,
		down: migration_20261001_000100_p3_shop_listing_seller.down,
		name: "20261001_000100_p3_shop_listing_seller",
	},
	{
		up: migration_20261001_000000_p3_invitation_pending_key.up,
		down: migration_20261001_000000_p3_invitation_pending_key.down,
		name: "20261001_000000_p3_invitation_pending_key",
	},
	{
		up: migration_20261001_000200_p3_shop_member_defaults.up,
		down: migration_20261001_000200_p3_shop_member_defaults.down,
		name: "20261001_000200_p3_shop_member_defaults",
	},
	{
		up: migration_20261002_000000_p4_order_indexes.up,
		down: migration_20261002_000000_p4_order_indexes.down,
		name: "20261002_000000_p4_order_indexes",
	},
	{
		up: migration_20261002_000100_p4_review_shop_index.up,
		down: migration_20261002_000100_p4_review_shop_index.down,
		name: "20261002_000100_p4_review_shop_index",
	},
	{
		up: migration_20261003_000000_p5_invoice_indexes.up,
		down: migration_20261003_000000_p5_invoice_indexes.down,
		name: "20261003_000000_p5_invoice_indexes",
	},
	{
		up: migration_20261004_000000_p6_case_indexes.up,
		down: migration_20261004_000000_p6_case_indexes.down,
		name: "20261004_000000_p6_case_indexes",
	},
];
