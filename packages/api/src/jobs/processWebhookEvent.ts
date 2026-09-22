import type { TaskConfig } from "payload";
import { processWebhookEvent } from "../services/webhookEvents";

export const processWebhookEventTask: TaskConfig<"processWebhookEvent"> = {
	slug: "processWebhookEvent",
	retries: { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
	inputSchema: [{ name: "eventId", type: "text", required: true }],
	outputSchema: [{ name: "outcome", type: "text" }],
	handler: async ({ input, req }) => {
		const { outcome } = await processWebhookEvent(req.payload, input.eventId);
		return { output: { outcome } };
	},
};
