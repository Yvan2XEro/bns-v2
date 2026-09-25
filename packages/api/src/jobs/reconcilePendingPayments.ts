import type { TaskConfig } from "payload";
import { reconcilePendingPayments } from "../services/paymentReconciliation";

export const reconcilePendingPaymentsTask: TaskConfig<"reconcilePendingPayments"> =
	{
		slug: "reconcilePendingPayments",
		retries: 0,
		inputSchema: [],
		outputSchema: [
			{ name: "checked", type: "number" },
			{ name: "settled", type: "number" },
			{ name: "expired", type: "number" },
			{ name: "errors", type: "number" },
		],
		schedule: [{ cron: "*/15 * * * *", queue: "payments" }],
		handler: async ({ req }) => ({
			output: await reconcilePendingPayments(req.payload),
		}),
	};
