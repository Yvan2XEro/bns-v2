import type { TaskConfig } from "payload";
import { expirePurchaseOrders } from "../services/purchaseOrders";

export const expirePurchaseOrdersTask: TaskConfig<{
	input: object;
	output: { expiredCount: number };
}> = {
	slug: "expirePurchaseOrders",
	retries: 1,
	schedule: [{ cron: "*/5 * * * *", queue: "orders" }],
	inputSchema: [],
	outputSchema: [{ name: "expiredCount", type: "number" }],
	handler: async ({ req }) => ({
		output: {
			expiredCount: (await expirePurchaseOrders(req.payload)).length,
		},
	}),
};
