"use client";

import { ChatClient, type ChatMessage, type ConnectionState } from "@bns/chat-client";
import { ArrowLeft, Circle, Send, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useAuth } from "~/hooks/use-auth";
import type { Listing, Message, User } from "~/types";

const CHAT_URL =
	process.env.NEXT_PUBLIC_CHAT_URL || "http://localhost:4000";

interface ConversationWithDetails {
	id: number;
	participants: User[];
	listing?: Listing;
	lastMessage?: Message;
	updatedAt: string;
	createdAt: string;
}

interface MessagesClientProps {
	user: User;
	initialConversations: ConversationWithDetails[];
	preSelectedConversation: ConversationWithDetails | null;
	initialMessages: Message[];
}

export function MessagesClient({
	user,
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
	const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});

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
			url: CHAT_URL,
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
							id: Number(msg.id),
							conversation: Number(msg.conversationId),
							sender: Number(msg.sender) as unknown as User | number,
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
				setUnreadCounts(prev => ({
					...prev,
					[Number(msg.conversationId)]: (prev[Number(msg.conversationId)] || 0) + 1,
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
	}, [token]);

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
	}, [selectedConversation?.id]);

	// Fetch messages when conversation changes
	const fetchMessages = useCallback(async (conversationId: number) => {
		try {
			const res = await fetch(
				`/api/messages?where[conversation][equals]=${conversationId}&sort=createdAt&depth=1`,
				{ credentials: "include" },
			);
			if (res.ok) {
				const data = await res.json();
				setMessages(data.docs || []);
				// Mark as read
				setUnreadCounts(prev => {
					const next = { ...prev };
					delete next[conversationId];
					return next;
				});
				fetch(`/api/messages?where[conversation][equals]=${conversationId}&where[read][equals]=false`, {
					credentials: "include",
				}).then(async (res) => {
					if (!res.ok) return;
					const data = await res.json();
					const unreadMessages = data.docs || [];
					for (const msg of unreadMessages) {
						fetch(`/api/messages/${msg.id}`, {
							method: "PATCH",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ read: true }),
							credentials: "include",
						}).catch(() => {});
					}
				}).catch(() => {});
			}
		} catch (error) {
			console.error("Failed to fetch messages:", error);
		}
	}, []);

	useEffect(() => {
		if (selectedConversation) {
			fetchMessages(selectedConversation.id);
		}
	}, [selectedConversation?.id, fetchMessages]);

	// Scroll to bottom on new messages
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

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

	function isUserOnline(userId: number): boolean {
		return onlineUsers.has(String(userId));
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
		<div className="container mx-auto max-w-7xl flex h-[calc(100vh-4rem)] px-4 sm:px-6 lg:px-8 py-6">
			<div className="flex w-full gap-6">
				{/* Conversation list */}
				<div
					className={`w-full md:w-1/3 ${selectedConversation ? "hidden md:block" : ""}`}
				>
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-xl font-bold text-[#0F172A]">Messages</h2>
						<div className="flex items-center gap-1.5 text-xs text-[#64748B]">
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
										key={conv.id}
										className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-[#F1F5F9] ${
											selectedConversation?.id === conv.id ? "bg-[#EFF6FF] border border-[#DBEAFE]" : ""
										}`}
										onClick={() => setSelectedConversation(conv)}
									>
										<div className="relative">
											<Avatar>
												<AvatarImage
													src={(other?.avatar as { url?: string })?.url}
												/>
												<AvatarFallback className="bg-[#1E40AF] text-xs font-semibold text-white">
													{other?.name?.charAt(0) || "?"}
												</AvatarFallback>
											</Avatar>
											{online && (
												<Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-green-500 text-green-500" />
											)}
										</div>
										<div className="flex-1 overflow-hidden">
											<p className="font-medium text-[#0F172A] truncate">
												{other?.name || "Unknown"}
											</p>
											{conv.lastMessage && (
												<p className="text-sm text-[#64748B] truncate">
													{conv.lastMessage.content}
												</p>
											)}
										</div>
										{(unreadCounts[conv.id] || 0) > 0 && (
											<span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#1E40AF] px-1.5 text-[10px] font-bold text-white">
												{unreadCounts[conv.id]}
											</span>
										)}
									</button>
								);
							})
						) : (
							<p className="text-center text-[#64748B]">
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
							<div className="mb-4 flex items-center gap-3 border-b border-[#E2E8F0] pb-4">
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
													getOtherParticipant(selectedConversation)
														?.avatar as { url?: string }
												)?.url
											}
										/>
										<AvatarFallback className="bg-[#1E40AF] text-xs font-semibold text-white">
											{getOtherParticipant(
												selectedConversation,
											)?.name?.charAt(0) || "?"}
										</AvatarFallback>
									</Avatar>
									{getOtherParticipant(selectedConversation) &&
										isUserOnline(
											getOtherParticipant(selectedConversation)!.id,
										) && (
											<Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-green-500 text-green-500" />
										)}
								</div>
								<div>
									<p className="font-medium text-[#0F172A]">
										{getOtherParticipant(selectedConversation)?.name ||
											"Unknown"}
									</p>
									{selectedConversation.listing && (
										<p className="text-xs text-[#64748B]">
											Re: {(selectedConversation.listing as Listing).title}
										</p>
									)}
								</div>
							</div>

							<div className="flex-1 overflow-y-auto space-y-4 mb-4">
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
														? "bg-[#1E40AF] text-white rounded-2xl rounded-br-md"
														: "bg-[#F1F5F9] text-[#0F172A] rounded-2xl rounded-bl-md"
												}`}
											>
												<p>{message.content}</p>
												<p
													className={`text-xs ${
														isOwn
															? "text-white/70"
															: "text-[#94A3B8]"
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
								<p className="mb-2 text-xs text-[#94A3B8] animate-pulse">
									{getTypingLabel()}
								</p>
							)}

							<form onSubmit={sendMessage} className="flex gap-2 border-t border-[#E2E8F0] pt-4">
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
									className="rounded-xl bg-[#1E40AF] hover:bg-[#1E40AF]/90 text-white"
								>
									<Send className="h-4 w-4" />
								</Button>
							</form>
						</>
					) : (
						<div className="flex h-full flex-col items-center justify-center gap-3">
							<Send className="h-10 w-10 text-[#94A3B8]" />
							<p className="text-[#64748B] font-medium">Select a conversation</p>
							<p className="text-sm text-[#94A3B8]">Choose a conversation from the list to start messaging</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
