import type { TaskConfig } from "payload";
import { submitRefund } from "../services/refunds";

export interface SubmitRefundInput {
	refundId: string;
}

/**
 * Queued after the refund row commits (and again, an hour later, for the
 * one automatic retry of a failed refund). A provider outage throws for the
 * job's retry; `submitRefund` fails the row itself on the last attempt.
 * Registered on the `payments` queue by P5 Task 20; exported only.
 */
export const submitRefundTask: TaskConfig<{
	input: SubmitRefundInput;
	output: { status: string; attempts: number };
}> = {
	slug: "submitRefund",
	retries: { attempts: 5, backoff: { type: "exponential", delay: 60_000 } },
	inputSchema: [{ name: "refundId", type: "text", required: true }],
	outputSchema: [
		{ name: "status", type: "text" },
		{ name: "attempts", type: "number" },
	],
	handler: async ({ req, input }) => ({
		output: await submitRefund(req.payload, input.refundId),
	}),
};
