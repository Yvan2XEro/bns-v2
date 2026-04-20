"use client";

import {
	ChatClient,
	type ChatMessage,
	type ConnectionState,
} from "@bns/chat-client";
import {
	ArrowLeft,
	Ban,
	Circle,
	MoreVertical,
	Send,
	ShieldOff,
	Trash2,
	Wifi,
	WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { useAuth } from "~/hooks/use-auth";
import { blockUser, deleteConversation, unblockUser } from "~/lib/actions";
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
	blockedUserIds?: string[];
	contextListing?: Listing | null;
}

export function MessagesClient({
	user,
	chatUrl,
	initialConversations,
	preSelectedConversation,
	initialMessages,
	blockedUserIds = [],
	contextListing,
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
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [blockedIds, setBlockedIds] = useState<Set<string>>(
		new Set(blockedUserIds),
	);
	const [isBlocking, startBlockTransition] = useTransition();

	const chatRef = useRef<ChatClient | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const selectedConvRef = useRef<ConversationWithDetails | null>(
		preSelectedConversation,
	);
	const prevConvIdRef = useRef<string | null>(
		preSelectedConversation ? String(preSelectedConversation.id) : null,
	);

	selectedConvRef.current = selectedConversation;

	function selectConversation(conv: ConversationWithDetails | null) {
		setSelectedConversation(conv);
		const url = conv ? `/messages?conversation=${conv.id}` : "/messages";
		window.history.replaceState(null, "", url);
	}

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
					// Replace optimistic message by tempId, or deduplicate by real id
					if (msg.tempId && prev.some((m) => m.id === msg.tempId)) {
						return prev.map((m) =>
							m.id === msg.tempId
								? ({
										id: msg.id,
										conversation: msg.conversationId,
										sender: msg.sender as unknown as User | string,
										content: msg.content,
										createdAt: msg.createdAt,
										updatedAt: msg.createdAt,
									} as Message)
								: m,
						);
					}
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

		client.on("message:confirmed", ({ tempId, message }) => {
			// Replace optimistic temp message with confirmed real message
			setMessages((prev) =>
				prev.map((m) =>
					m.id === tempId
						? ({
								id: message.id,
								conversation: message.conversationId,
								sender: message.sender as unknown as User | string,
								content: message.content,
								createdAt: message.createdAt,
								updatedAt: message.createdAt,
							} as Message)
						: m,
				),
			);
		});

		client.on("message:failed", ({ tempId }) => {
			// Remove failed optimistic message
			setMessages((prev) => prev.filter((m) => m.id !== tempId));
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

	function sendMessage(e: React.FormEvent) {
		e.preventDefault();
		const content = newMessage.trim();
		if (!content || !selectedConversation || !chatRef.current) return;

		const convId = String(selectedConversation.id);
		setNewMessage("");
		chatRef.current.stopTyping(convId);

		try {
			const tempId = chatRef.current.sendMessage({
				conversationId: convId,
				content,
			});
			// Add optimistic message immediately
			setMessages((prev) => [
				...prev,
				{
					id: tempId,
					conversation: convId,
					sender: user.id as unknown as User | string,
					content,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				} as Message,
			]);
		} catch {
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

	async function handleDeleteConversation() {
		if (!selectedConversation) return;
		setDeleting(true);
		const result = await deleteConversation(selectedConversation.id);
		setDeleting(false);
		if (result.success) {
			setConversations((prev) =>
				prev.filter((c) => c.id !== selectedConversation.id),
			);
			selectConversation(null);
			setMessages([]);
			setDeleteDialogOpen(false);
		}
	}

	function isOtherBlocked(conv: ConversationWithDetails): boolean {
		const other = getOtherParticipant(conv);
		return other ? blockedIds.has(other.id) : false;
	}

	function handleBlockToggle(otherUserId: string) {
		const isCurrentlyBlocked = blockedIds.has(otherUserId);
		startBlockTransition(async () => {
			if (isCurrentlyBlocked) {
				const result = await unblockUser(otherUserId);
				if (result.success) {
					setBlockedIds((prev) => {
						const next = new Set(prev);
						next.delete(otherUserId);
						return next;
					});
				}
			} else {
				const result = await blockUser(otherUserId);
				if (result.success) {
					setBlockedIds((prev) => new Set(prev).add(otherUserId));
				}
			}
		});
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
		<div className="container mx-auto flex h-[calc(100vh-3.5rem)] max-w-7xl overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
			<div className="flex h-full min-h-0 w-full gap-6">
				{/* Conversation list */}
				<div
					className={`flex min-h-0 w-full flex-col md:w-1/3 ${selectedConversation ? "hidden md:flex" : ""}`}
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
					<div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
						{conversations.length > 0 ? (
							conversations.map((conv) => {
								const other = getOtherParticipant(conv);
								const online = other ? isUserOnline(other.id) : false;
								const blocked = isOtherBlocked(conv);
								return (
									<button
										type="button"
										key={conv.id}
										className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-[#F1F5F9] ${
											selectedConversation?.id === conv.id
												? "border border-[#DBEAFE] bg-[#EFF6FF]"
												: ""
										}`}
										onClick={() => selectConversation(conv)}
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
											{online && !blocked && (
												<Circle className="-bottom-0.5 -right-0.5 absolute h-3 w-3 fill-green-500 text-green-500" />
											)}
										</div>
										<div className="flex-1 overflow-hidden">
											<div className="flex items-center gap-2">
												<p className="truncate font-medium text-[#0F172A]">
													{other?.name || "Unknown"}
												</p>
												{blocked && (
													<span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 font-medium text-[10px] text-red-600">
														Blocked
													</span>
												)}
											</div>
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
					className={`flex min-h-0 flex-1 flex-col ${!selectedConversation ? "max-md:hidden" : ""}`}
				>
					{selectedConversation ? (
						<>
							<div className="mb-4 flex items-center gap-3 border-[#E2E8F0] border-b pb-4">
								<Button
									variant="ghost"
									size="icon"
									className="md:hidden"
									onClick={() => selectConversation(null)}
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
									{(() => {
										const other = getOtherParticipant(selectedConversation);
										return other && isUserOnline(other.id) ? (
											<Circle className="-bottom-0.5 -right-0.5 absolute h-3 w-3 fill-green-500 text-green-500" />
										) : null;
									})()}
								</div>
								<div className="flex-1">
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
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon">
											<MoreVertical className="h-5 w-5 text-[#64748B]" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{(() => {
											const other = getOtherParticipant(selectedConversation);
											const blocked = other ? blockedIds.has(other.id) : false;
											return other ? (
												<DropdownMenuItem
													className={
														blocked
															? "text-[#64748B]"
															: "text-red-600 focus:text-red-600"
													}
													onClick={() => handleBlockToggle(other.id)}
													disabled={isBlocking}
												>
													{blocked ? (
														<>
															<ShieldOff className="mr-2 h-4 w-4" />
															{isBlocking ? "Unblocking..." : "Unblock user"}
														</>
													) : (
														<>
															<Ban className="mr-2 h-4 w-4" />
															{isBlocking ? "Blocking..." : "Block user"}
														</>
													)}
												</DropdownMenuItem>
											) : null;
										})()}
										<DropdownMenuItem
											className="text-red-600 focus:text-red-600"
											onClick={() => setDeleteDialogOpen(true)}
										>
											<Trash2 className="mr-2 h-4 w-4" />
											Delete conversation
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							<div className="mb-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
								{(() => {
									const card =
										contextListing ??
										(selectedConversation.listing
											? (selectedConversation.listing as Listing)
											: null);
									if (!card) return null;
									const cardWithImages = card as Listing & {
										images?: Array<{ image?: { url?: string } }>;
									};
									return (
										<a
											href={`/listing/${card.id}`}
											className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 transition-colors hover:bg-[#EFF6FF]"
										>
											{cardWithImages.images?.[0]?.image?.url && (
												<img
													src={cardWithImages.images[0].image?.url ?? ""}
													alt={card.title}
													className="h-14 w-14 shrink-0 rounded-lg object-cover"
												/>
											)}
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium text-[#0F172A] text-sm">
													{card.title}
												</p>
												<p className="font-bold text-[#1E40AF] text-sm">
													{card.price?.toLocaleString()} XAF
												</p>
											</div>
										</a>
									);
								})()}
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

							{isOtherBlocked(selectedConversation) ? (
								<div className="flex items-center justify-center gap-2 border-[#E2E8F0] border-t pt-4 text-[#94A3B8] text-sm">
									<Ban className="h-4 w-4" />
									You have blocked this user
								</div>
							) : (
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
							)}
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

			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete conversation</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this conversation? This action
							cannot be undone and all messages will be lost.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost" disabled={deleting}>
								Cancel
							</Button>
						</DialogClose>
						<Button
							variant="destructive"
							disabled={deleting}
							onClick={handleDeleteConversation}
						>
							{deleting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
