import * as migration_20260915_000000_p0_payment_intents from "./20260915_000000_p0_payment_intents";
import * as migration_20260915_000100_p0_reviews_audit from "./20260915_000100_p0_reviews_audit";
import * as migration_20260915_000200_p0_contact_reveal_windows from "./20260915_000200_p0_contact_reveal_windows";

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
];
