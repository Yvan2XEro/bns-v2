import type { TaskConfig } from "payload";
import { consumeRiskSignalOutbox } from "../services/riskSignalOutbox";

export const consumeRiskSignalOutboxTask: TaskConfig<"consumeRiskSignalOutbox"> =
	{
		slug: "consumeRiskSignalOutbox",
		retries: 2,
		schedule: [{ cron: "*/5 * * * *", queue: "cases" }],
		inputSchema: [],
		handler: async ({ req }) => ({
			output: await consumeRiskSignalOutbox(req.payload),
		}),
	};
