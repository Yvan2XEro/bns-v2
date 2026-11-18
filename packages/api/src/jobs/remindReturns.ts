import type { Payload, TaskConfig } from "payload";
import { relationId } from "../lib/relationId";
import type { Shipment } from "../payload-types";
import {
	deferDeliveryNotification,
	notifyShipmentReturnInitiated,
} from "../services/delivery/notifications";
import { SHIPMENT_SERVICE_CONTEXT } from "../services/delivery/shipmentTransitions";
import {
	DAY_MS,
	forEachShipment,
	HOUR_MS,
	metadataOf,
} from "./deliverySupport";

const REMINDER_AFTER_MS = 72 * HOUR_MS;
const OVERDUE_AFTER_MS = 7 * DAY_MS;

function returnStartedAt(shipment: Shipment): number | null {
	if (shipment.status !== "failed" || !shipment.finalFailure?.at) return null;
	return Date.parse(
		shipment.finalFailure.returnInitiatedAt ?? shipment.finalFailure.at,
	);
}

export async function remindReturns(
	payload: Payload,
	now: Date = new Date(),
): Promise<{ reminded: string[]; overdue: string[] }> {
	const nowMs = now.getTime();
	const reminded: string[] = [];
	const overdue: string[] = [];
	await forEachShipment(
		payload,
		{
			and: [
				{ status: { equals: "failed" } },
				{ "finalFailure.at": { exists: true } },
				{
					"finalFailure.returnInitiatedAt": {
						less_than_equal: new Date(nowMs - REMINDER_AFTER_MS).toISOString(),
					},
				},
			],
		},
		"remindReturns",
		async (req, shipment) => {
			const startedAt = returnStartedAt(shipment);
			if (startedAt === null) return null;
			const age = nowMs - startedAt;
			const flags = shipment.flags ?? [];
			if (age >= OVERDUE_AFTER_MS) {
				if (flags.includes("return_overdue")) return null;
				const shopId = relationId(shipment.fulfillingShop);
				const shop = shopId
					? await req.payload.findByID({
							collection: "shops",
							id: shopId,
							depth: 0,
							overrideAccess: true,
							req,
						})
					: null;
				const reporter = shop ? relationId(shop.owner) : null;
				const existing = await req.payload.find({
					collection: "reports",
					where: {
						and: [
							{ targetType: { equals: "shipment" } },
							{ targetId: { equals: String(shipment.id) } },
							{ reason: { equals: "return_overdue" } },
						],
					},
					limit: 1,
					depth: 0,
					overrideAccess: true,
					req,
				});
				if (reporter && existing.docs.length === 0) {
					await req.payload.create({
						collection: "reports",
						req,
						overrideAccess: true,
						data: {
							reporter,
							targetType: "shipment",
							targetId: String(shipment.id),
							reason: "return_overdue",
							status: "pending",
						},
					});
				}
				await req.payload.update({
					collection: "shipments",
					id: String(shipment.id),
					req,
					overrideAccess: true,
					context: SHIPMENT_SERVICE_CONTEXT,
					data: { flags: [...flags, "return_overdue"] },
				});
				overdue.push(String(shipment.id));
				return String(shipment.id);
			}
			const metadata = metadataOf(shipment);
			if (age < REMINDER_AFTER_MS || metadata.returnReminderAt) return null;
			const updated = await req.payload.update({
				collection: "shipments",
				id: String(shipment.id),
				req,
				overrideAccess: true,
				context: SHIPMENT_SERVICE_CONTEXT,
				data: {
					metadata: { ...metadata, returnReminderAt: now.toISOString() },
				},
			});
			const orderId = relationId(updated.order);
			const reason = updated.finalFailure?.reason;
			if (orderId && reason) {
				const order = await req.payload.findByID({
					collection: "orders",
					id: orderId,
					depth: 0,
					overrideAccess: true,
					req,
				});
				deferDeliveryNotification(
					req,
					() =>
						notifyShipmentReturnInitiated(req.payload, order, updated, reason),
					"return-reminder notification",
				);
			}
			reminded.push(String(shipment.id));
			return String(shipment.id);
		},
	);
	return { reminded, overdue };
}

export const remindReturnsTask: TaskConfig<{
	input: object;
	output: { remindedCount: number; overdueCount: number };
}> = {
	slug: "remindReturns",
	retries: 1,
	inputSchema: [],
	handler: async ({ req }) => {
		const { reminded, overdue } = await remindReturns(req.payload);
		return {
			output: { remindedCount: reminded.length, overdueCount: overdue.length },
		};
	},
};
