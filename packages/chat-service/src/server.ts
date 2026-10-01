import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import { startMembershipSubscriber } from "./membership.ts";
import { createRedisClients } from "./redis.ts";
import { registerSocketHandlers } from "./socket.ts";

const PORT = Number.parseInt(process.env.PORT || "4000", 10);

async function main(): Promise<void> {
	const httpServer = createServer();

	const io = new Server(httpServer, {
		cors: {
			origin: process.env.CORS_ORIGIN || "*",
			methods: ["GET", "POST"],
		},
		connectionStateRecovery: {
			maxDisconnectionDuration: 2 * 60 * 1000,
		},
	});

	const { pubClient, subClient } = createRedisClients();
	await Promise.all([pubClient.connect(), subClient.connect()]);
	io.adapter(createAdapter(pubClient, subClient));
	console.log("[chat-service] Redis adapter connected");

	// A subscribed client cannot issue other commands, and the adapter owns
	// `subClient` entirely, so the membership channel gets its own connection.
	const membershipClient = pubClient.duplicate();
	await membershipClient.connect();
	await startMembershipSubscriber(io, membershipClient);
	console.log("[chat-service] chat:membership subscriber started");

	registerSocketHandlers(io);

	httpServer.listen(PORT, () => {
		console.log(`[chat-service] Listening on port ${PORT}`);
	});

	const shutdown = async () => {
		console.log("[chat-service] Shutting down...");
		io.close();
		await membershipClient.quit();
		await pubClient.quit();
		await subClient.quit();
		httpServer.close();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((error) => {
	console.error("[chat-service] Fatal error:", error);
	process.exit(1);
});
