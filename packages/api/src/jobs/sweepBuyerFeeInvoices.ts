import type { TaskConfig } from "payload";
import { issueMissingBuyerFeeInvoices } from "../services/buyerFeeInvoices";

/** Hourly on the `payments` queue; registered and scheduled by P5 Task 20, exported only. */
export const sweepBuyerFeeInvoicesTask: TaskConfig<{
	input: object;
	output: { checked: number; issued: number; errors: number };
}> = {
	slug: "sweepBuyerFeeInvoices",
	retries: 0,
	inputSchema: [],
	handler: async ({ req }) => ({
		output: await issueMissingBuyerFeeInvoices(req.payload),
	}),
};
