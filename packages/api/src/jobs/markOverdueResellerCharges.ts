import type { TaskConfig } from "payload";
import { markOverdueResellerCharges } from "../services/purchaseOrders";

export const markOverdueResellerChargesTask: TaskConfig<"markOverdueResellerCharges"> =
	{
		slug: "markOverdueResellerCharges",
		retries: 1,
		schedule: [{ cron: "0 2 * * *", queue: "nightly" }],
		inputSchema: [],
		handler: async ({ req }) => ({
			output: await markOverdueResellerCharges(req.payload),
		}),
	};
