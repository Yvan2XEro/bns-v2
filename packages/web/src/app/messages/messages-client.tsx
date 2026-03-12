"use client";

import {
	ChatClient,
	type ChatMessage,
	type ConnectionState,
} from "@bns/chat-client";
import { ArrowLeft, Circle, Send, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useAuth } from "~/hooks/use-auth";
import type { Listing, Message, User } from "~/types";

interface ConversationWithDetails {
	id: string;
	participants: User[];
	listing?: Listing;
	lastMessage?: Message;
	updatedAt: string;
	createdAt: string;
}

interface MessagesClientProps {
	user: User;
	chatUrl: string;
	initialConversations: ConversationWithDetails[];
	preSelectedConversation: ConversationWithDetails | null;
	initialMessages: Message[];
}

export function MessagesClient({
	user,
	chatUrl,
	initialConversations,
	preSelectedConversation,
	initialMessages,
}: MessagesClientProps) {
	const { token } = useAuth();
	const [conversations, setConversations] = useState(initialConversations);
	const [selectedConversation, setSelectedConversation] =
		useState<ConversationWithDetails | null>(preSelectedConversation);
	const [messages, setMessages] = useState<Message[]>(initialMessages);
	const [newMessage, setNewMessage] = useState("");
	const [connectionState, setConnectionState] =
		useState<ConnectionState>("disconnected");
	const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
	const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

	const chatRef = useRef<ChatClient | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const selectedConvRef = useRef<ConversationWithDetails | null>(
		preSelectedConversation,
	);
	const prevConvIdRef = useRef<string | null>(
		preSelectedConversation ? String(preSelectedConversation.id) : null,
	);

	selectedConvRef.current = selectedConversation;

	// Connect chat client when token is available
	useEffect(() => {
		if (!token) return;

		const client = new ChatClient({
			url: chatUrl,
			token,
		});

		client.on("connection:change", (state) => {
			setConnectionState(state);
		});

		client.on("message:new", (msg: ChatMessage) => {
			const currentConv = selectedConvRef.current;
			if (currentConv && msg.conversationId === String(currentConv.id)) {
				setMessages((prev) => {
					// Deduplicate
					if (prev.some((m) => String(m.id) === msg.id)) return prev;
					return [
						...prev,
						{
							id: msg.id,
							conversation: msg.conversationId,
							sender: msg.sender as unknown as User | string,
							content: msg.content,
							createdAt: msg.createdAt,
							updatedAt: msg.createdAt,
						} as Message,
					];
				});
			}
			// Update last message in conversation list
			setConversations((prev) =>
				prev.map((c) =>
					String(c.id) === msg.conversationId
						? { ...c, lastMessage: { content: msg.content } as Message }
						: c,
				),
			);
		});

		client.on("typing", (event) => {
			const currentConv = selectedConvRef.current;
			if (currentConv && event.conversationId === String(currentConv.id)) {
				setTypingUsers((prev) => {
					const next = new Set(prev);
					if (event.isTyping) {
						next.add(event.userId);
					} else {
						next.delete(event.userId);
					}
					return next;
				});
			}
		});

		client.on("user:online", ({ userId }) => {
			setOnlineUsers((prev) => new Set(prev).add(userId));
		});

		client.on("user:offline", ({ userId }) => {
			setOnlineUsers((prev) => {
				const next = new Set(prev);
				next.delete(userId);
				return next;
			});
		});

		client.on("error", (err) => {
			console.error("[chat]", err);
		});

		client.connect();
		chatRef.current = client;

		return () => {
			client.disconnect();
			chatRef.current = null;
		};
	}, [token, chatUrl]);

	// Update token in client if it changes
	useEffect(() => {
		if (token && chatRef.current) {
			chatRef.current.updateToken(token);
		}
	}, [token]);

	// Join/leave conversation rooms when selection changes
	useEffect(() => {
		const client = chatRef.current;
		if (!client) return;

		const prevId = prevConvIdRef.current;
		const newId = selectedConversation ? String(selectedConversation.id) : null;

		if (prevId && prevId !== newId) {
			client.leaveConversation(prevId);
		}

		if (newId && newId !== prevId) {
			client.joinConversation(newId);
		}

		prevConvIdRef.current = newId;
	}, [selectedConversation?.id, selectedConversation]);

	// Fetch messages when conversation changes
	const fetchMessages = useCallback(async (conversationId: string) => {
		try {
			const res = await fetch(
				`/api/messages?where[conversation][equals]=${conversationId}&sort=createdAt&depth=1`,
				{ credentials: "include" },
			);
			if (res.ok) {
				const data = await res.json();
				setMessages(data.docs || []);
			}
		} catch (error) {
			console.error("Failed to fetch messages:", error);
		}
	}, []);

	useEffect(() => {
		if (selectedConversation) {
			fetchMessages(selectedConversation.id);
		}
	}, [selectedConversation?.id, fetchMessages, selectedConversation]);

	// Scroll to bottom on new messages
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	async function sendMessage(e: React.FormEvent) {
		e.preventDefault();
		const content = newMessage.trim();
		if (!content || !selectedConversation || !chatRef.current) return;

		const convId = String(selectedConversation.id);
		setNewMessage("");
		chatRef.current.stopTyping(convId);

		try {
			await chatRef.current.sendMessage({
				conversationId: convId,
				content,
			});
		} catch {
			// Re-fill input on failure
			setNewMessage(content);
		}
	}

	function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
		setNewMessage(e.target.value);
		if (selectedConversation && chatRef.current) {
			chatRef.current.startTyping(String(selectedConversation.id));
		}
	}

	function getOtherParticipant(conv: ConversationWithDetails): User | null {
		return conv.participants?.find((p) => p.id !== user.id) || null;
	}

	function isUserOnline(userId: string): boolean {
		return onlineUsers.has(userId);
	}

	function getTypingLabel(): string | null {
		const names = Array.from(typingUsers)
			.filter((id) => id !== String(user.id))
			.map((id) => {
				const p = selectedConversation?.participants?.find(
					(u) => String(u.id) === id,
				);
				return p?.name || "Someone";
			});
		if (names.length === 0) return null;
		return `${names.join(", ")} is typing...`;
	}

	return (
		<div className="container mx-auto flex h-[calc(100vh-4rem)] px-4 py-8">
			<div className="flex w-full gap-6">
				{/* Conversation list */}
				<div
					className={`w-full md:w-1/3 ${selectedConversation ? "hidden md:block" : ""}`}
				>
					<div className="mb-4 flex items-center justify-between">
						<h2 className="font-semibold text-xl">Messages</h2>
						<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
							{connectionState === "connected" ? (
								<Wifi className="h-3.5 w-3.5 text-green-500" />
							) : (
								<WifiOff className="h-3.5 w-3.5 text-red-500" />
							)}
							{connectionState}
						</div>
					</div>
					<div className="space-y-2">
						{conversations.length > 0 ? (
							conversations.map((conv) => {
								const other = getOtherParticipant(conv);
								const online = other ? isUserOnline(other.id) : false;
								return (
									<button
										type="button"
										key={conv.id}
										className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent ${
											selectedConversation?.id === conv.id ? "bg-accent" : ""
										}`}
										onClick={() => setSelectedConversation(conv)}
									>
										<div className="relative">
											<Avatar>
												<AvatarImage
													src={(other?.avatar as { url?: string })?.url}
												/>
												<AvatarFallback>
													{other?.name?.charAt(0) || "?"}
												</AvatarFallback>
											</Avatar>
											{online && (
												<Circle className="-bottom-0.5 -right-0.5 absolute h-3 w-3 fill-green-500 text-green-500" />
											)}
										</div>
										<div className="flex-1 overflow-hidden">
											<p className="truncate font-medium">
												{other?.name || "Unknown"}
											</p>
											{conv.lastMessage && (
												<p className="truncate text-muted-foreground text-sm">
													{conv.lastMessage.content}
												</p>
											)}
										</div>
									</button>
								);
							})
						) : (
							<p className="text-center text-muted-foreground">
								No conversations yet
							</p>
						)}
					</div>
				</div>

				{/* Chat area */}
				<div
					className={`flex-1 ${!selectedConversation ? "hidden md:flex" : ""} flex-col`}
				>
					{selectedConversation ? (
						<>
							<div className="mb-4 flex items-center gap-3 border-b pb-4">
								<Button
									variant="ghost"
									size="icon"
									className="md:hidden"
									onClick={() => setSelectedConversation(null)}
								>
									<ArrowLeft className="h-5 w-5" />
								</Button>
								<div className="relative">
									<Avatar>
										<AvatarImage
											src={
												(
													getOtherParticipant(selectedConversation)?.avatar as {
														url?: string;
													}
												)?.url
											}
										/>
										<AvatarFallback>
											{getOtherParticipant(selectedConversation)?.name?.charAt(
												0,
											) || "?"}
										</AvatarFallback>
									</Avatar>
									{getOtherParticipant(selectedConversation) &&
										isUserOnline(
											getOtherParticipant(selectedConversation)?.id,
										) && (
											<Circle className="-bottom-0.5 -right-0.5 absolute h-3 w-3 fill-green-500 text-green-500" />
										)}
								</div>
								<div>
									<p className="font-medium">
										{getOtherParticipant(selectedConversation)?.name ||
											"Unknown"}
									</p>
									{selectedConversation.listing && (
										<p className="text-muted-foreground text-xs">
											Re: {(selectedConversation.listing as Listing).title}
										</p>
									)}
								</div>
							</div>

							<div className="mb-4 flex-1 space-y-4 overflow-y-auto">
								{messages.map((message) => {
									const senderId =
										typeof message.sender === "object"
											? (message.sender as User).id
											: message.sender;
									const isOwn = senderId === user.id;
									return (
										<div
											key={message.id}
											className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
										>
											<div
												className={`max-w-[70%] rounded-lg px-4 py-2 ${
													isOwn
														? "bg-primary text-primary-foreground"
														: "bg-muted"
												}`}
											>
												<p>{message.content}</p>
												<p
													className={`text-xs ${
														isOwn
															? "text-primary-foreground/70"
															: "text-muted-foreground"
													}`}
												>
													{new Date(message.createdAt).toLocaleTimeString([], {
														hour: "2-digit",
														minute: "2-digit",
													})}
												</p>
											</div>
										</div>
									);
								})}
								<div ref={messagesEndRef} />
							</div>

							{getTypingLabel() && (
								<p className="mb-2 animate-pulse text-muted-foreground text-xs">
									{getTypingLabel()}
								</p>
							)}

							<form onSubmit={sendMessage} className="flex gap-2">
								<Input
									placeholder="Type a message..."
									value={newMessage}
									onChange={handleInputChange}
									disabled={connectionState !== "connected"}
								/>
								<Button
									type="submit"
									size="icon"
									disabled={
										connectionState !== "connected" || !newMessage.trim()
									}
								>
									<Send className="h-4 w-4" />
								</Button>
							</form>
						</>
					) : (
						<div className="flex h-full items-center justify-center">
							<p className="text-muted-foreground">Select a conversation</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
