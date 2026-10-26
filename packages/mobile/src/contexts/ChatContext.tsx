import { ChatClient } from "@bns/chat-client";
import type React from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useAuth } from "@/src/lib/auth";

/**
 * Exported so a consumer (e.g. `useShopInboxSocket`) can type its own params
 * against the same shape instead of redeclaring `{ chatClient, onlineUsers }`.
 */
export type ChatContextValue = {
	chatClient: ChatClient | null;
	onlineUsers: Set<string>;
};

const ChatContext = createContext<ChatContextValue>({
	chatClient: null,
	onlineUsers: new Set(),
});

export function ChatProvider({ children }: { children: React.ReactNode }) {
	const { user, token } = useAuth();
	const { chatUrl } = useAppConfig();
	const [chatClient, setChatClient] = useState<ChatClient | null>(null);
	const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
	const clientRef = useRef<ChatClient | null>(null);
	const userId = user?.id ?? null;
	// The latest token, read when the socket is created; a refresh after that
	// is handed to the live socket instead of reconnecting it (below).
	const tokenRef = useRef(token);
	tokenRef.current = token;
	const signedIn = Boolean(userId && token);

	// One socket per signed-in user. It is not torn down when the token is
	// refreshed or the profile reloaded (every return to the foreground does
	// both): closing a WebSocket in the middle of its handshake raced OkHttp's
	// reader on Android and crashed the app (Sentry 156244033).
	useEffect(() => {
		// `chatUrl` arrives from /api/public/config, so it is null on the first
		// render. Falling back to a cleartext localhost URL meant every cold start
		// opened a connection iOS App Transport Security blocks outright.
		const currentToken = tokenRef.current;
		if (!userId || !signedIn || !currentToken || !chatUrl) {
			clientRef.current?.disconnect();
			clientRef.current = null;
			setChatClient(null);
			setOnlineUsers(new Set());
			return;
		}

		const client = new ChatClient({ url: chatUrl, token: currentToken });
		clientRef.current = client;

		client.on("user:online", ({ userId }) => {
			setOnlineUsers((prev) => new Set([...prev, userId]));
		});

		client.on("user:offline", ({ userId }) => {
			setOnlineUsers((prev) => {
				const next = new Set(prev);
				next.delete(userId);
				return next;
			});
		});

		client.connect();
		setChatClient(client);

		return () => {
			client.disconnect();
			clientRef.current = null;
			setChatClient(null);
		};
	}, [userId, signedIn, chatUrl]);

	// A refreshed token rides on the open socket and its next reconnection.
	useEffect(() => {
		if (token) clientRef.current?.updateToken(token);
	}, [token]);

	return (
		<ChatContext.Provider value={{ chatClient, onlineUsers }}>
			{children}
		</ChatContext.Provider>
	);
}

export function useChatClient() {
	return useContext(ChatContext);
}
