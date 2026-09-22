import * as migration_20260915_000000_p0_payment_intents from "./20260915_000000_p0_payment_intents";

export const migrations = [
	{
		up: migration_20260915_000000_p0_payment_intents.up,
		down: migration_20260915_000000_p0_payment_intents.down,
		name: "20260915_000000_p0_payment_intents",
	},
];
