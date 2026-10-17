"use client";

import type { ChatClient } from "@bns/chat-client";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { useAppConfig } from "~/hooks/use-app-config";
import { useAuth } from "~/hooks/use-auth";

interface ChatClientContextValue {
	chatClient: ChatClient | null;
}

const ChatClientContext = createContext<ChatClientContextValue>({
	chatClient: null,
});

/**
 * One socket for the whole app, mirroring `ChatContext` on mobile. A screen
 * that built its own `ChatClient` (personal messages, pre-Task 23) keeps
 * doing so for now — folding it onto this provider is a separate change —
 * but any new screen (the shop inbox) consumes this one, so two instances
 * never double-fire the same server event for the same page.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
	const { user, token } = useAuth();
	const { chatUrl } = useAppConfig();
	const [chatClient, setChatClient] = useState<ChatClient | null>(null);
	const clientRef = useRef<ChatClient | null>(null);

	useEffect(() => {
		if (!user || !token || !chatUrl) {
			clientRef.current?.disconnect();
			clientRef.current = null;
			setChatClient(null);
			return;
		}

		// Loaded here rather than imported: socket.io is only worth its weight
		// to a signed-in visitor, and most page views are anonymous.
		let client: ChatClient | null = null;
		let cancelled = false;
		import("@bns/chat-client").then(({ ChatClient }) => {
			if (cancelled) return;
			client = new ChatClient({ url: chatUrl, token });
			clientRef.current = client;
			client.connect();
			setChatClient(client);
		});

		return () => {
			cancelled = true;
			client?.disconnect();
			clientRef.current = null;
			setChatClient(null);
		};
	}, [user, token, chatUrl]);

	useEffect(() => {
		if (token && clientRef.current) {
			clientRef.current.updateToken(token);
		}
	}, [token]);

	return (
		<ChatClientContext.Provider value={{ chatClient }}>
			{children}
		</ChatClientContext.Provider>
	);
}

export function useChatClient(): ChatClientContextValue {
	return useContext(ChatClientContext);
}
