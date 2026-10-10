// THROWAWAY debug harness — never commit to main history.
// Mode A (default): in-memory Mongo, seeds its own user+shop.
// Mode B (DEBUG_DB_URI set): READ-ONLY against that database — replays
// getMyShop for every active shop member until one throws.
import { getMyShop } from "../services/shops";

async function boot() {
	if (process.env.DEBUG_DB_URI) {
		process.env.DATABASE_URI = process.env.DEBUG_DB_URI;
		process.env.MONGODB_URI = process.env.DEBUG_DB_URI;
		return null;
	}
	const { MongoMemoryServer } = await import("mongodb-memory-server");
	const mongo = await MongoMemoryServer.create();
	process.env.DATABASE_URI = mongo.getUri("bns-debug");
	process.env.MONGODB_URI = process.env.DATABASE_URI;
	return mongo;
}

async function main() {
	const mongo = await boot();
	const { default: config } = await import("@payload-config");
	const { getPayload } = await import("payload");
	const payload = await getPayload({ config });
	console.log("payload booted; mode:", mongo ? "memory" : "READ-ONLY real db");

	if (mongo) {
		const user = await payload.create({
			collection: "users",
			data: {
				email: "repro@test.local",
				password: "Passw0rd!Passw0rd!",
				phone: "+237650000001",
				phoneVerified: true,
			} as never,
			overrideAccess: true,
		});
		await payload.create({
			collection: "shops",
			data: {
				name: "Repro Shop",
				handle: "repro-shop",
				owner: user.id,
				location: { city: "douala" },
			} as never,
			overrideAccess: true,
		});
	}

	const members = await payload.find({
		collection: "shop-members",
		where: { status: { equals: "active" } },
		depth: 0,
		limit: 10,
		overrideAccess: true,
	});
	console.log("active members:", members.totalDocs);
	for (const m of members.docs) {
		const userId = String(typeof m.user === "object" && m.user ? m.user.id : m.user);
		const user = await payload
			.findByID({ collection: "users", id: userId, depth: 0, overrideAccess: true })
			.catch(() => null);
		if (!user) continue;
		try {
			const res = await getMyShop(payload, user as never);
			console.log("OK", userId, "->", res.shop ? `${res.shop.handle} (${res.shop.status})` : "no shop");
		} catch (e) {
			console.log("=== THREW for", userId, "===");
			console.log((e as Error).stack);
			break;
		}
	}
	if (mongo) await mongo.stop();
	process.exit(0);
}
main().catch((e) => {
	console.error("BOOT FAIL", (e as Error).stack?.split("\n").slice(0, 8).join("\n"));
	process.exit(1);
});
