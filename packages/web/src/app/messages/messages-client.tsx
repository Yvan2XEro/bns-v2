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
	const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

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
			// Track unread for non-selected conversations
			if (!currentConv || msg.conversationId !== String(currentConv.id)) {
				setUnreadCounts((prev) => ({
					...prev,
					[msg.conversationId]: (prev[msg.conversationId] || 0) + 1,
				}));
			}
		});

		client.on("typing", (event) => {
			const activeConv = selectedConvRef.current;
			if (activeConv && event.conversationId === String(activeConv.id)) {
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
				// Mark as read
				setUnreadCounts((prev) => {
					const next = { ...prev };
					delete next[conversationId];
					return next;
				});
				fetch(
					`/api/messages?where[conversation][equals]=${conversationId}&where[read][equals]=false`,
					{
						credentials: "include",
					},
				)
					.then(async (res) => {
						if (!res.ok) return;
						const data = await res.json();
						const unreadMessages = data.docs || [];
						for (const msg of unreadMessages) {
							fetch(`/api/messages/${msg.id}`, {
								method: "PATCH",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ read: true }),
								credentials: "include",
							}).catch(() => {
								/* ignore */
							});
						}
					})
					.catch(() => {
						/* ignore */
					});
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
		<div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
			<div className="flex w-full gap-6">
				{/* Conversation list */}
				<div
					className={`w-full md:w-1/3 ${selectedConversation ? "hidden md:block" : ""}`}
				>
					<div className="mb-4 flex items-center justify-between">
						<h2 className="font-bold text-[#0F172A] text-xl">Messages</h2>
						<div className="flex items-center gap-1.5 text-[#64748B] text-xs">
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
										className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-[#F1F5F9] ${
											selectedConversation?.id === conv.id
												? "border border-[#DBEAFE] bg-[#EFF6FF]"
												: ""
										}`}
										onClick={() => setSelectedConversation(conv)}
									>
										<div className="relative">
											<Avatar>
												<AvatarImage
													src={(other?.avatar as { url?: string })?.url}
												/>
												<AvatarFallback className="bg-[#1E40AF] font-semibold text-white text-xs">
													{other?.name?.charAt(0) || "?"}
												</AvatarFallback>
											</Avatar>
											{online && (
												<Circle className="-bottom-0.5 -right-0.5 absolute h-3 w-3 fill-green-500 text-green-500" />
											)}
										</div>
										<div className="flex-1 overflow-hidden">
											<p className="truncate font-medium text-[#0F172A]">
												{other?.name || "Unknown"}
											</p>
											{conv.lastMessage && (
												<p className="truncate text-[#64748B] text-sm">
													{conv.lastMessage.content}
												</p>
											)}
										</div>
										{(unreadCounts[conv.id] || 0) > 0 && (
											<span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#1E40AF] px-1.5 font-bold text-[10px] text-white">
												{unreadCounts[conv.id]}
											</span>
										)}
									</button>
								);
							})
						) : (
							<p className="text-center text-[#64748B]">No conversations yet</p>
						)}
					</div>
				</div>

				{/* Chat area */}
				<div
					className={`flex-1 ${!selectedConversation ? "hidden md:flex" : ""} flex-col`}
				>
					{selectedConversation ? (
						<>
							<div className="mb-4 flex items-center gap-3 border-[#E2E8F0] border-b pb-4">
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
										<AvatarFallback className="bg-[#1E40AF] font-semibold text-white text-xs">
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
									<p className="font-medium text-[#0F172A]">
										{getOtherParticipant(selectedConversation)?.name ||
											"Unknown"}
									</p>
									{selectedConversation.listing && (
										<p className="text-[#64748B] text-xs">
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
												className={`max-w-[70%] px-4 py-2 ${
													isOwn
														? "rounded-2xl rounded-br-md bg-[#1E40AF] text-white"
														: "rounded-2xl rounded-bl-md bg-[#F1F5F9] text-[#0F172A]"
												}`}
											>
												<p>{message.content}</p>
												<p
													className={`text-xs ${
														isOwn ? "text-white/70" : "text-[#94A3B8]"
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
								<p className="mb-2 animate-pulse text-[#94A3B8] text-xs">
									{getTypingLabel()}
								</p>
							)}

							<form
								onSubmit={sendMessage}
								className="flex gap-2 border-[#E2E8F0] border-t pt-4"
							>
								<Input
									placeholder="Type a message..."
									value={newMessage}
									onChange={handleInputChange}
									disabled={connectionState !== "connected"}
									className="rounded-xl border-[#E2E8F0] focus:border-[#1E40AF] focus:ring-[#1E40AF]"
								/>
								<Button
									type="submit"
									size="icon"
									disabled={
										connectionState !== "connected" || !newMessage.trim()
									}
									className="rounded-xl bg-[#1E40AF] text-white hover:bg-[#1E40AF]/90"
								>
									<Send className="h-4 w-4" />
								</Button>
							</form>
						</>
					) : (
						<div className="flex h-full flex-col items-center justify-center gap-3">
							<Send className="h-10 w-10 text-[#94A3B8]" />
							<p className="font-medium text-[#64748B]">
								Select a conversation
							</p>
							<p className="text-[#94A3B8] text-sm">
								Choose a conversation from the list to start messaging
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
