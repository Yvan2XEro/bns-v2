import type { PayloadRequest, TaskConfig } from "payload";
import { getPaymentSettings } from "../lib/paymentSettings";
import type { MarketplaceProvider } from "../lib/payments/marketplace";
import { getMarketplaceProvider } from "../lib/payments/marketplaceRegistry";
import { syncConnectedAccount } from "../services/connectedAccounts";

export interface SyncConnectedAccountInput {
	/** One row (queued on onboarding return); omitted, the 6-hourly sweep. */
	connectedAccountId?: string;
}

export interface SyncConnectedAccountOutput {
	synced: number;
	failed: number;
}

/**
 * One row when named; otherwise every row still `onboarding` or `restricted`.
 * A sweep keeps going past a row the provider refuses, so one stuck account
 * cannot starve the rest; a named row's failure is thrown for the retry.
 */
export async function runSyncConnectedAccount(
	req: PayloadRequest,
	input: SyncConnectedAccountInput,
	provider?: MarketplaceProvider,
): Promise<SyncConnectedAccountOutput> {
	const settings = await getPaymentSettings(req.payload);
	const deps = {
		settings,
		provider: provider ?? getMarketplaceProvider(settings),
	};

	if (input.connectedAccountId) {
		const row = await syncConnectedAccount(req, input.connectedAccountId, deps);
		return { synced: row ? 1 : 0, failed: 0 };
	}

	const { docs } = await req.payload.find({
		collection: "connected-accounts",
		where: { status: { in: ["onboarding", "restricted"] } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	let synced = 0;
	let failed = 0;
	for (const row of docs) {
		try {
			if (await syncConnectedAccount(req, String(row.id), deps)) synced++;
		} catch (error) {
			failed++;
			req.payload.logger.error(
				{ err: error, connectedAccountId: row.id },
				"[syncConnectedAccount] sync failed",
			);
		}
	}
	return { synced, failed };
}

/** Registered, scheduled and queued by Task 20; exported only. */
export const syncConnectedAccountTask: TaskConfig<{
	input: SyncConnectedAccountInput;
	output: SyncConnectedAccountOutput;
}> = {
	slug: "syncConnectedAccount",
	retries: 3,
	inputSchema: [{ name: "connectedAccountId", type: "text" }],
	outputSchema: [
		{ name: "synced", type: "number" },
		{ name: "failed", type: "number" },
	],
	handler: async ({ req, input }) => ({
		output: await runSyncConnectedAccount(req, input),
	}),
};
