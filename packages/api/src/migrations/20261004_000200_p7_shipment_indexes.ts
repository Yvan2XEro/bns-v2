import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const shipments = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections.shipments.collection;

export const LIVE_SHIPMENT_PER_ORDER_INDEX = "shipments_one_live_per_order";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	await shipments(payload).createIndex(
		{ order: 1 },
		{
			unique: true,
			name: LIVE_SHIPMENT_PER_ORDER_INDEX,
			partialFilterExpression: {
				status: {
					$in: [
						"pending",
						"picked_up",
						"in_transit",
						"delivered",
						"failed",
						"returned",
					],
				},
			},
		},
	);
	payload.logger.info({
		msg: "[migration] P7: one non-cancelled shipment per order",
		index: LIVE_SHIPMENT_PER_ORDER_INDEX,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await shipments(payload)
		.dropIndex(LIVE_SHIPMENT_PER_ORDER_INDEX)
		.catch(() => undefined);
}
