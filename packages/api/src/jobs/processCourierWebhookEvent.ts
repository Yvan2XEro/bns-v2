import type { TaskConfig } from "payload";
import { z } from "zod";
import type { CourierProviderId } from "../lib/delivery/types";
import { FAILURE_REASONS, SHIPMENT_STATUSES } from "../lib/delivery/types";
import { withTransaction } from "../lib/transactions";
import { applyCourierEvent } from "../services/delivery/webhooks";

const eventSchema = z.object({
	reference: z.string(),
	providerShipmentId: z.string(),
	providerStatus: z.string(),
	status: z.enum(SHIPMENT_STATUSES).nullable(),
	occurredAt: z.coerce.date(),
	providerEventId: z.string(),
	type: z.string(),
	rider: z
		.object({
			name: z.string(),
			phone: z.string().optional(),
			vehicle: z.string().optional(),
		})
		.optional(),
	attempt: z
		.object({ reason: z.enum(FAILURE_REASONS), note: z.string().optional() })
		.optional(),
	proof: z
		.object({
			podUrl: z.string().optional(),
			recipientName: z.string().optional(),
			gps: z.object({ lat: z.number(), lng: z.number() }).optional(),
		})
		.optional(),
	codCollectedAmount: z.number().optional(),
});

function isCourierProvider(
	value: unknown,
): value is Exclude<CourierProviderId, "manual"> {
	return value === "yango" || value === "campost";
}

export const processCourierWebhookEventTask: TaskConfig<"processCourierWebhookEvent"> =
	{
		slug: "processCourierWebhookEvent",
		retries: { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
		inputSchema: [{ name: "eventId", type: "text", required: true }],
		outputSchema: [{ name: "outcome", type: "text" }],
		handler: async ({ input, req }) => {
			const row = await req.payload.findByID({
				collection: "webhook-events",
				id: input.eventId,
				depth: 0,
				overrideAccess: true,
			});
			if (row.processedAt) return { output: { outcome: "already_processed" } };
			const attempts = (row.attempts ?? 0) + 1;
			try {
				const provider = row.provider;
				if (!isCourierProvider(provider)) {
					throw new Error("Courier event has an invalid provider");
				}
				const parsed = eventSchema.parse(row.raw);
				const outcome = await withTransaction(req.payload, (txReq) =>
					applyCourierEvent(txReq, provider, parsed),
				);
				await req.payload.update({
					collection: "webhook-events",
					id: String(row.id),
					depth: 0,
					overrideAccess: true,
					data: {
						attempts,
						processedAt: new Date().toISOString(),
						lastError: null,
					},
				});
				return { output: { outcome: outcome.outcome } };
			} catch (error) {
				await req.payload.update({
					collection: "webhook-events",
					id: String(row.id),
					depth: 0,
					overrideAccess: true,
					data: {
						attempts,
						lastError: (error instanceof Error
							? error.message
							: String(error)
						).slice(0, 500),
					},
				});
				throw error;
			}
		},
	};
