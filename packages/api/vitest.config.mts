import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths(), react()],
	resolve: {
		alias: {
			// `chat-channel-parity.int.spec.ts` (Task 15) imports a chat-service
			// module, which imports Bun's built-in `RedisClient` from the bare
			// specifier "bun" — not a package, so Vite's resolver 404s on it.
			// See the shim file for why a stub is enough here.
			bun: fileURLToPath(
				new URL("./tests/int/helpers/bunRedisShim.ts", import.meta.url),
			),
		},
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./vitest.setup.ts"],
		include: ["tests/int/**/*.int.spec.ts"],
		// Several route specs pay for a first `await import(ROUTE)` that pulls
		// in `payload.config.ts` and every collection it registers — a real,
		// one-time module-load cost, not a hang. Measured at 3.5-3.7s alone
		// (I11 in the P2 final review), that sits at ~73% of the 5s vitest
		// default and times out outright under a busy full-suite parallel
		// run. Raised here, once, for the whole suite, instead of a per-file
		// `it(..., { timeout })` workaround repeated on every spec that
		// happens to hit the cost first.
		testTimeout: 15_000,
	},
});
