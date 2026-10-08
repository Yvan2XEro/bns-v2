import type { Payload, TaskConfig } from "payload";
import { getCourierProvider } from "../lib/delivery";
import type { CourierWebhookEvent } from "../lib/delivery/types";
import { withTransaction } from "../lib/transactions";
import { applyCourierEvent } from "../services/delivery/webhooks";
import { LIVE_SHIPMENT_STATUSES } from "./deliverySupport";

const STALE_AFTER_MS = 30 * 60_000;

export async function pollCourierShipments(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ polled: string[]; failed: string[] }> {
	const found = await payload.find({
		collection: "shipments",
		where: {
			and: [
				{ provider: { in: ["yango", "campost"] } },
				{ providerShipmentId: { exists: true } },
				{ status: { in: LIVE_SHIPMENT_STATUSES } },
			],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	const polled: string[] = [];
	const failed: string[] = [];
	for (const candidate of found.docs) {
		const provider = candidate.provider;
		const providerShipmentId = candidate.providerShipmentId;
		if (
			(provider !== "yango" && provider !== "campost") ||
			!providerShipmentId
		) {
			continue;
		}
		try {
			const courier = getCourierProvider(provider, { payload });
			const syncedAt = candidate.lastProviderSyncAt
				? Date.parse(candidate.lastProviderSyncAt)
				: Number.NEGATIVE_INFINITY;
			if (
				courier.capabilities.webhooks &&
				now.getTime() - syncedAt <= STALE_AFTER_MS
			) {
				continue;
			}
			const snapshot = await courier.getStatus(providerShipmentId);
			const event: CourierWebhookEvent = {
				...snapshot,
				providerEventId: `poll:${providerShipmentId}:${snapshot.providerStatus}:${snapshot.occurredAt.toISOString()}`,
				type: "shipment.poll",
			};
			await withTransaction(payload, async (req) => {
				await applyCourierEvent(req, provider, event);
				await req.payload.update({
					collection: "shipments",
					id: String(candidate.id),
					req,
					overrideAccess: true,
					depth: 0,
					data: { lastProviderSyncAt: now.toISOString() },
				});
			});
			polled.push(String(candidate.id));
		} catch (error) {
			payload.logger.error(
				{ err: error, shipmentId: String(candidate.id) },
				"[delivery] courier poll failed for one shipment; continuing",
			);
			failed.push(String(candidate.id));
		}
	}
	return { polled, failed };
}

export const pollCourierShipmentsTask: TaskConfig<{
	input: object;
	output: { polledCount: number; failedCount: number };
}> = {
	slug: "pollCourierShipments",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const { polled, failed } = await pollCourierShipments(req.payload);
		return {
			output: { polledCount: polled.length, failedCount: failed.length },
		};
	},
};
