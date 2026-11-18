import type { Payload, TaskConfig } from "payload";
import { applyTransition } from "../services/orders/transitions";
import { eachOrder, HOURLY_QUEUE, selectOrders } from "./orderSweep";

export interface CompleteOrdersResult {
	completed: number;
	errors: number;
}

/**
 * `delivered` → `completed` once the withdrawal window has run out. A hold
 * stops it: an order with an open return case or a dispute waits for the
 * case to close (P6), and until then staff handle it from the admin panel,
 * so the filter is part of the selection rather than something
 * `applyTransition` could know about.
 */
export async function completeOrders(
	payload: Payload,
): Promise<CompleteOrdersResult> {
	const nowIso = new Date().toISOString();
	const result: CompleteOrdersResult = { completed: 0, errors: 0 };

	const due = await selectOrders(payload, {
		and: [
			{ status: { equals: "delivered" } },
			{ "deadlines.completeAt": { less_than_equal: nowIso } },
			{
				or: [
					{ completionHold: { equals: "none" } },
					{ completionHold: { exists: false } },
				],
			},
		],
	});

	result.errors += await eachOrder(
		payload,
		due,
		"completeOrders",
		async (req, order) => {
			await applyTransition(
				req,
				order,
				{
					status: "completed",
					set: {
						timestamps: {
							...order.timestamps,
							completedAt: new Date().toISOString(),
						},
					},
				},
				{
					type: "order.completed",
					actorType: "system",
					actor: null,
					visibility: "both",
					source: "job",
				},
			);
			result.completed += 1;
		},
	);

	return result;
}

export const completeOrdersTask: TaskConfig<"completeOrders"> = {
	slug: "completeOrders",
	retries: 1,
	inputSchema: [],
	outputSchema: [
		{ name: "completed", type: "number" },
		{ name: "errors", type: "number" },
	],
	schedule: [{ cron: "0 * * * *", queue: HOURLY_QUEUE }],
	handler: async ({ req }) => ({ output: await completeOrders(req.payload) }),
};
