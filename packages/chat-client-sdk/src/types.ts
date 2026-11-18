/** Events the client can send to the server */
export interface ClientToServerEvents {
	"conversation:join": (
		payload: { conversationId: string },
		ack?: (response: AckResponse) => void,
	) => void;
	"conversation:leave": (payload: { conversationId: string }) => void;
	"message:send": (payload: SendMessagePayload) => void;
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
	"shop:inbox:join": (
		payload: { shopId: string },
		ack?: (response: AckResponse) => void,
	) => void;
	"shop:inbox:leave": (payload: { shopId: string }) => void;
}

/** Events the server can send to the client */
export interface ServerToClientEvents {
	"message:new": (message: ChatMessage) => void;
	"message:confirmed": (payload: {
		tempId: string;
		message: ChatMessage;
	}) => void;
	"message:failed": (payload: { tempId: string; error: string }) => void;
	"message:delivered": (payload: { messageId: string; userId: string }) => void;
	"message:read": (payload: { messageIds: string[]; userId: string }) => void;
	typing: (payload: TypingEvent) => void;
	"user:online": (payload: { userId: string }) => void;
	"user:offline": (payload: { userId: string }) => void;
	"inbox:conversation-updated": (payload: InboxConversationUpdate) => void;
	"shop:access-revoked": (payload: { shopId: string }) => void;
}

export interface ListingAttachment {
	id: string;
	title: string;
	price?: number;
	thumbnailUrl?: string;
}

export interface ChatMessage {
	id: string;
	conversationId: string;
	sender: string;
	content: string;
	createdAt: string;
	tempId?: string;
	listing?: ListingAttachment;
	shopId?: string;
	/** Absent, or `"user"`, for an ordinary message. `"system"` for a line
	 * the order service posted — `sender` is then an empty string, never a
	 * user id. */
	kind?: "user" | "system";
	/** System messages only: the order-event type, e.g. `"order.placed"`. */
	systemEvent?: string;
	/** System messages only: structured data for a localised chip. */
	systemParams?: Record<string, unknown>;
}

export interface InboxConversationUpdate {
	conversationId: string;
	assignee: string | null;
	inboxStatus: "open" | "done";
	awaitingReply: boolean;
	lastMessageAt: string | null;
}

export interface SendMessagePayload {
	conversationId: string;
	content: string;
	tempId?: string;
	listing?: string;
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
	"message:confirmed": (payload: {
		tempId: string;
		message: ChatMessage;
	}) => void;
	"message:failed": (payload: { tempId: string; error: string }) => void;
	"message:delivered": (payload: { messageId: string; userId: string }) => void;
	"message:read": (payload: { messageIds: string[]; userId: string }) => void;
	"message:sent": (message: ChatMessage) => void;
	"message:error": (error: string) => void;
	typing: (event: TypingEvent) => void;
	"user:online": (payload: { userId: string }) => void;
	"user:offline": (payload: { userId: string }) => void;
	"inbox:conversation-updated": (payload: InboxConversationUpdate) => void;
	"shop:access-revoked": (payload: { shopId: string }) => void;
	error: (error: Error) => void;
};
