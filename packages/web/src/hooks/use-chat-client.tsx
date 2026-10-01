"use client";

import { ChatClient } from "@bns/chat-client";
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

		const client = new ChatClient({ url: chatUrl, token });
		clientRef.current = client;
		client.connect();
		setChatClient(client);

		return () => {
			client.disconnect();
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
