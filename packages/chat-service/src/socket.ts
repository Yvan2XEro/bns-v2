import type { Server, Socket } from "socket.io";
import { verifyToken } from "./auth.ts";
import { registerMessageHandlers } from "./messageHandler.ts";
import { refreshPresence, setOffline, setOnline } from "./presence.ts";
import { getRoomId, joinRoom, leaveRoom } from "./rooms.ts";

export function registerSocketHandlers(io: Server): void {
	io.use(async (socket, next) => {
		const token =
			socket.handshake.auth?.token ||
			socket.handshake.headers?.authorization?.replace("Bearer ", "");

		if (!token) {
			return next(new Error("Authentication required"));
		}

		try {
			const auth = await verifyToken(token);
			socket.data.userId = auth.userId;
			socket.data.email = auth.email;
			socket.data.token = token;
			next();
		} catch (error) {
			console.error(
				JSON.stringify({
					event: "auth:failed",
					error: String(error),
					timestamp: new Date().toISOString(),
				}),
			);
			next(new Error("Invalid token"));
		}
	});

	io.on("connection", async (socket: Socket) => {
		const userId = socket.data.userId as string;
		const token = socket.data.token as string;

		console.log(
			JSON.stringify({
				event: "connection",
				userId,
				socketId: socket.id,
				timestamp: new Date().toISOString(),
			}),
		);

		await setOnline(userId);
		io.emit("user:online", { userId });

		const presenceInterval = setInterval(() => {
			refreshPresence(userId);
		}, 30_000);

		registerMessageHandlers(io, socket, userId, token);

		socket.on(
			"conversation:join",
			async (
				payload: { conversationId: string },
				ack?: (response: { success: boolean; error?: string }) => void,
			) => {
				const joined = await joinRoom(
					socket,
					payload.conversationId,
					userId,
					token,
				);

				if (!joined) {
					ack?.({
						success: false,
						error: "Access denied to conversation",
					});
					console.error(
						JSON.stringify({
							event: "conversation:join:denied",
							userId,
							conversationId: payload.conversationId,
							timestamp: new Date().toISOString(),
						}),
					);
					return;
				}

				ack?.({ success: true });
				console.log(
					JSON.stringify({
						event: "conversation:join",
						userId,
						conversationId: payload.conversationId,
						timestamp: new Date().toISOString(),
					}),
				);
			},
		);

		socket.on("conversation:leave", (payload: { conversationId: string }) => {
			leaveRoom(socket, payload.conversationId);
			console.log(
				JSON.stringify({
					event: "conversation:leave",
					userId,
					conversationId: payload.conversationId,
					timestamp: new Date().toISOString(),
				}),
			);
		});

		socket.on("typing:start", (payload: { conversationId: string }) => {
			const roomId = getRoomId(payload.conversationId);
			socket.to(roomId).emit("typing", {
				userId,
				conversationId: payload.conversationId,
				isTyping: true,
			});
		});

		socket.on("typing:stop", (payload: { conversationId: string }) => {
			const roomId = getRoomId(payload.conversationId);
			socket.to(roomId).emit("typing", {
				userId,
				conversationId: payload.conversationId,
				isTyping: false,
			});
		});

		socket.on("disconnect", async (reason) => {
			clearInterval(presenceInterval);
			await setOffline(userId);
			io.emit("user:offline", { userId });

			console.log(
				JSON.stringify({
					event: "disconnect",
					userId,
					socketId: socket.id,
					reason,
					timestamp: new Date().toISOString(),
				}),
			);
		});
	});
}
