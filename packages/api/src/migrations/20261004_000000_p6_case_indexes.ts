import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const collection = (payload: MigrateUpArgs["payload"], slug: string) =>
	(payload.db as unknown as MongooseAdapter).collections[slug].collection;

export const ACTIVE_DISPUTE_INDEX = "disputes_one_active_per_order";
export const ACTIVE_STRIKE_SOURCE_INDEX = "shop_strikes_one_active_source";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	await collection(payload, "reviews").updateMany(
		{ status: { $exists: false } },
		{ $set: { status: "published" } },
	);
	await collection(payload, "disputes").createIndex(
		{ order: 1 },
		{
			unique: true,
			name: ACTIVE_DISPUTE_INDEX,
			partialFilterExpression: {
				status: {
					$in: ["open", "awaiting_seller", "awaiting_buyer", "under_review"],
				},
			},
		},
	);
	await collection(payload, "shop-strikes").createIndex(
		{ shop: 1, kind: 1, sourceType: 1, sourceId: 1 },
		{
			unique: true,
			name: ACTIVE_STRIKE_SOURCE_INDEX,
			partialFilterExpression: { status: "active" },
		},
	);
	payload.logger.info({
		msg: "[migration] P6: legacy reviews published and one active dispute per order",
		index: ACTIVE_DISPUTE_INDEX,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await collection(payload, "disputes")
		.dropIndex(ACTIVE_DISPUTE_INDEX)
		.catch(() => undefined);
	await collection(payload, "shop-strikes")
		.dropIndex(ACTIVE_STRIKE_SOURCE_INDEX)
		.catch(() => undefined);
}
