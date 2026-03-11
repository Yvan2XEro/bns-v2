/** Events the client can send to the server */
export interface ClientToServerEvents {
	"conversation:join": (
		payload: { conversationId: string },
		ack?: (response: AckResponse) => void,
	) => void;
	"conversation:leave": (payload: { conversationId: string }) => void;
	"message:send": (
		payload: SendMessagePayload,
		ack?: (response: SendMessageAck) => void,
	) => void;
	"message:delivered": (payload: {
		conversationId: string;
		messageId: string;
	}) => void;
	"message:read": (payload: {
		conversationId: string;
		messageIds: string[];
	}) => void;
	"typing:start": (payload: { conversationId: string }) => void;
	"typing:stop": (payload: { conversationId: string }) => void;
}

/** Events the server can send to the client */
export interface ServerToClientEvents {
	"message:new": (message: ChatMessage) => void;
	"message:delivered": (payload: {
		messageId: string;
		userId: string;
	}) => void;
	"message:read": (payload: {
		messageIds: string[];
		userId: string;
	}) => void;
	typing: (payload: TypingEvent) => void;
	"user:online": (payload: { userId: string }) => void;
	"user:offline": (payload: { userId: string }) => void;
}

export interface ChatMessage {
	id: string;
	conversationId: string;
	sender: string;
	content: string;
	createdAt: string;
}

export interface SendMessagePayload {
	conversationId: string;
	content: string;
}

export interface AckResponse {
	success: boolean;
	error?: string;
}

export interface SendMessageAck extends AckResponse {
	message?: ChatMessage;
}

export interface TypingEvent {
	userId: string;
	conversationId: string;
	isTyping: boolean;
}

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface ChatClientOptions {
	/** Chat service URL (e.g. http://localhost:4000) */
	url: string;
	/** Auth token (Payload JWT) */
	token: string;
	/** Auto-reconnect on disconnect (default: true) */
	autoReconnect?: boolean;
	/** Socket.io transports (default: ["websocket"]) */
	transports?: string[];
}

export type ChatEventMap = {
	"connection:change": (state: ConnectionState) => void;
	"message:new": (message: ChatMessage) => void;
	"message:delivered": (payload: { messageId: string; userId: string }) => void;
	"message:read": (payload: { messageIds: string[]; userId: string }) => void;
	"message:sent": (message: ChatMessage) => void;
	"message:error": (error: string) => void;
	typing: (event: TypingEvent) => void;
	"user:online": (payload: { userId: string }) => void;
	"user:offline": (payload: { userId: string }) => void;
	error: (error: Error) => void;
};
