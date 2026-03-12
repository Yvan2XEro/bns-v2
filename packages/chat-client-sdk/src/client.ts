import { io, type Socket } from "socket.io-client";
import type {
	ChatClientOptions,
	ChatEventMap,
	ChatMessage,
	ClientToServerEvents,
	ConnectionState,
	SendMessagePayload,
	ServerToClientEvents,
	TypingEvent,
} from "./types";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Listener<K extends keyof ChatEventMap> = ChatEventMap[K];

export class ChatClient {
	private socket: TypedSocket | null = null;
	private options: Required<ChatClientOptions>;
	private state: ConnectionState = "disconnected";
	private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	private joinedConversations = new Set<string>();
	private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(options: ChatClientOptions) {
		this.options = {
			autoReconnect: true,
			transports: ["websocket"],
			...options,
		};
	}

	// --- Connection ---

	connect(): void {
		if (this.socket?.connected) return;

		this.setState("connecting");

		this.socket = io(this.options.url, {
			transports: this.options.transports,
			auth: { token: this.options.token },
			reconnection: this.options.autoReconnect,
			reconnectionAttempts: 10,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 10000,
		}) as TypedSocket;

		this.socket.on("connect", () => {
			this.setState("connected");
			// Rejoin conversations after reconnect
			for (const convId of this.joinedConversations) {
				this.socket?.emit("conversation:join", { conversationId: convId });
			}
		});

		this.socket.on("disconnect", () => {
			this.setState("disconnected");
		});

		this.socket.on("connect_error", (err) => {
			this.setState("disconnected");
			this.emit("error", err);
		});

		// Forward server events
		this.socket.on("message:new", (msg: ChatMessage) => {
			this.emit("message:new", msg);
		});

		this.socket.on("message:delivered", (payload) => {
			this.emit("message:delivered", payload);
		});

		this.socket.on("message:read", (payload) => {
			this.emit("message:read", payload);
		});

		this.socket.on("typing", (event: TypingEvent) => {
			this.emit("typing", event);
		});

		this.socket.on("user:online", (payload) => {
			this.emit("user:online", payload);
		});

		this.socket.on("user:offline", (payload) => {
			this.emit("user:offline", payload);
		});
	}

	disconnect(): void {
		this.joinedConversations.clear();
		for (const timer of this.typingTimers.values()) {
			clearTimeout(timer);
		}
		this.typingTimers.clear();
		this.socket?.disconnect();
		this.socket = null;
		this.setState("disconnected");
	}

	/** Update the auth token (e.g. after refresh) */
	updateToken(token: string): void {
		this.options.token = token;
		if (this.socket) {
			this.socket.auth = { token };
		}
	}

	getState(): ConnectionState {
		return this.state;
	}

	isConnected(): boolean {
		return this.state === "connected";
	}

	// --- Conversations ---

	joinConversation(conversationId: string): Promise<boolean> {
		return new Promise((resolve) => {
			if (!this.socket?.connected) {
				this.joinedConversations.add(conversationId);
				resolve(false);
				return;
			}

			this.socket.emit("conversation:join", { conversationId }, (response) => {
				if (response?.success) {
					this.joinedConversations.add(conversationId);
					resolve(true);
				} else {
					resolve(false);
				}
			});
		});
	}

	leaveConversation(conversationId: string): void {
		this.joinedConversations.delete(conversationId);
		this.stopTyping(conversationId);
		this.socket?.emit("conversation:leave", { conversationId });
	}

	leaveAllConversations(): void {
		for (const convId of this.joinedConversations) {
			this.socket?.emit("conversation:leave", { conversationId: convId });
		}
		this.joinedConversations.clear();
	}

	// --- Messages ---

	sendMessage(payload: SendMessagePayload): Promise<ChatMessage> {
		return new Promise((resolve, reject) => {
			if (!this.socket?.connected) {
				const err = "Not connected";
				this.emit("message:error", err);
				reject(new Error(err));
				return;
			}

			this.socket.emit("message:send", payload, (response) => {
				if (response?.success && response.message) {
					this.emit("message:sent", response.message);
					resolve(response.message);
				} else {
					const err = response?.error || "Failed to send message";
					this.emit("message:error", err);
					reject(new Error(err));
				}
			});
		});
	}

	markDelivered(conversationId: string, messageId: string): void {
		this.socket?.emit("message:delivered", { conversationId, messageId });
	}

	markRead(conversationId: string, messageIds: string[]): void {
		if (messageIds.length === 0) return;
		this.socket?.emit("message:read", { conversationId, messageIds });
	}

	// --- Typing ---

	startTyping(conversationId: string): void {
		this.socket?.emit("typing:start", { conversationId });

		// Auto-stop after 3s of no calls
		const existing = this.typingTimers.get(conversationId);
		if (existing) clearTimeout(existing);

		this.typingTimers.set(
			conversationId,
			setTimeout(() => {
				this.stopTyping(conversationId);
			}, 3000),
		);
	}

	stopTyping(conversationId: string): void {
		const timer = this.typingTimers.get(conversationId);
		if (timer) {
			clearTimeout(timer);
			this.typingTimers.delete(conversationId);
		}
		this.socket?.emit("typing:stop", { conversationId });
	}

	// --- Event Emitter ---

	on<K extends keyof ChatEventMap>(event: K, listener: Listener<K>): this {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)?.add(listener as (...args: unknown[]) => void);
		return this;
	}

	off<K extends keyof ChatEventMap>(event: K, listener: Listener<K>): this {
		this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
		return this;
	}

	private emit<K extends keyof ChatEventMap>(
		event: K,
		...args: Parameters<ChatEventMap[K]>
	): void {
		const set = this.listeners.get(event);
		if (!set) return;
		for (const fn of set) {
			try {
				fn(...args);
			} catch (err) {
				console.error(`[ChatClient] Error in ${event} listener:`, err);
			}
		}
	}

	private setState(state: ConnectionState): void {
		if (this.state === state) return;
		this.state = state;
		this.emit("connection:change", state);
	}
}
