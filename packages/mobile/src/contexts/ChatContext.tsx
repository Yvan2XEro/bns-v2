import { ChatClient } from "@bns/chat-client";
import type React from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useAuth } from "@/src/lib/auth";

type ChatContextValue = {
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
	const CHAT_URL = chatUrl ?? "http://localhost:4000";
	const [chatClient, setChatClient] = useState<ChatClient | null>(null);
	const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
	const clientRef = useRef<ChatClient | null>(null);

	useEffect(() => {
		if (!user || !token) {
			clientRef.current?.disconnect();
			clientRef.current = null;
			setChatClient(null);
			setOnlineUsers(new Set());
			return;
		}

		const client = new ChatClient({ url: CHAT_URL, token });
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
	}, [user?.id, token, user, CHAT_URL]);

	return (
		<ChatContext.Provider value={{ chatClient, onlineUsers }}>
			{children}
		</ChatContext.Provider>
	);
}

export function useChatClient() {
	return useContext(ChatContext);
}
