import type {
	MigrateDownArgs,
	MigrateUpArgs,
	MongooseAdapter,
} from "@payloadcms/db-mongodb";

const locations = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections["shop-locations"]
		.collection;

export const DEFAULT_DELIVERY_ORIGIN_INDEX =
	"shop_locations_one_default_origin";

export async function up({ payload }: MigrateUpArgs): Promise<void> {
	const collection = locations(payload);
	const rows = await collection
		.find({})
		.sort({ shop: 1, createdAt: 1 })
		.toArray();
	const shops = new Map<string, typeof rows>();
	for (const row of rows) {
		const key = String(row.shop);
		const group = shops.get(key) ?? [];
		group.push(row);
		shops.set(key, group);
	}

	for (const group of shops.values()) {
		const origins = group.filter(
			(row) => row.active === true && row.isDispatchOrigin === true,
		);
		const preferred =
			origins.find((row) => row.isDefaultOrigin === true) ?? origins[0];
		const shopId = group[0]?.shop;
		if (shopId === undefined) continue;
		await collection.updateMany(
			{ shop: shopId, isDefaultOrigin: true },
			{ $set: { isDefaultOrigin: false } },
		);
		if (preferred)
			await collection.updateOne(
				{ _id: preferred._id },
				{ $set: { isDefaultOrigin: true } },
			);
	}

	await collection.createIndex(
		{ shop: 1 },
		{
			unique: true,
			name: DEFAULT_DELIVERY_ORIGIN_INDEX,
			partialFilterExpression: { isDefaultOrigin: true },
		},
	);
	payload.logger.info({
		msg: "[migration] P7: one default dispatch origin per shop",
		index: DEFAULT_DELIVERY_ORIGIN_INDEX,
	});
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await locations(payload)
		.dropIndex(DEFAULT_DELIVERY_ORIGIN_INDEX)
		.catch(() => undefined);
}
