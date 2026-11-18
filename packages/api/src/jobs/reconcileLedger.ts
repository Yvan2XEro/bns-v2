import type { TaskConfig } from "payload";
import { runMarketSweep } from "../services/marketSweep";
import {
	reconciliationWindow,
	runReconciliation,
} from "../services/reconciliation";

/**
 * Registered and scheduled (hourly; each market reconciles at its own reconcileHourLocal) by the jobs wiring
 * (P5 Task 20), not here. A failed run is recorded as `failed` and rethrown,
 * so the retry runs it again as a new run.
 */
export const reconcileLedgerTask: TaskConfig<{
	input: object;
	output: {
		runId: string;
		checked: number;
		matched: number;
		autoFixed: number;
		mismatches: number;
	};
}> = {
	slug: "reconcileLedger",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const outcome = await runMarketSweep(req.payload, "reconcile", () =>
			runReconciliation(req.payload, reconciliationWindow()),
		);
		if (!outcome.ran)
			return {
				output: {
					runId: "",
					checked: 0,
					matched: 0,
					autoFixed: 0,
					mismatches: 0,
				},
			};
		const run = outcome.result;
		return {
			output: {
				runId: String(run.id),
				checked: run.counts?.checked ?? 0,
				matched: run.counts?.matched ?? 0,
				autoFixed: run.counts?.autoFixed ?? 0,
				mismatches: run.counts?.mismatches ?? 0,
			},
		};
	},
};
