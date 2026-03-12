import { getAuthUser, serverFetch } from "~/lib/server-api";
import type { Listing, Message, User } from "~/types";
import { MessagesClient } from "./messages-client";

interface ConversationWithDetails {
	id: string;
	participants: User[];
	listing?: Listing;
	lastMessage?: Message;
	updatedAt: string;
	createdAt: string;
}

async function getConversations(): Promise<ConversationWithDetails[]> {
	try {
		const res = await serverFetch("/api/conversations?depth=2");
		if (!res.ok) return [];
		const data = await res.json();
		return data.docs || data || [];
	} catch {
		return [];
	}
}

async function getMessages(conversationId: string): Promise<Message[]> {
	try {
		const res = await serverFetch(
			`/api/messages?where[conversation][equals]=${conversationId}&sort=createdAt&depth=1`,
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.docs || data || [];
	} catch {
		return [];
	}
}

async function getListing(id: string): Promise<Listing | null> {
	try {
		const res = await serverFetch(`/api/listings/${id}?depth=1`);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

async function findOrCreateConversation(
	listingId: string,
	userId: string,
	conversations: ConversationWithDetails[],
): Promise<ConversationWithDetails | null> {
	// Check existing conversations for this listing
	const existing = conversations.find((c) => {
		const convListing = c.listing as Listing | undefined;
		return convListing?.id === listingId;
	});
	if (existing) return existing;

	// Fetch listing to get seller
	const listing = await getListing(listingId);
	if (!listing) return null;

	const sellerId =
		typeof listing.seller === "object"
			? (listing.seller as User)?.id
			: listing.seller;

	// Don't create conversation with yourself
	if (!sellerId || sellerId === userId) return null;

	// Create a new conversation
	try {
		const res = await serverFetch("/api/conversations", {
			method: "POST",
			body: JSON.stringify({
				participants: [userId, sellerId],
				listing: listingId,
			}),
		});
		if (!res.ok) return null;
		const data = await res.json();
		const conv = data.doc || data;

		// Re-fetch with depth to get populated participants/listing
		const fullRes = await serverFetch(
			`/api/conversations/${conv.id}?depth=2`,
		);
		if (!fullRes.ok) return conv;
		return fullRes.json();
	} catch {
		return null;
	}
}

export default async function MessagesPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string>>;
}) {
	const params = await searchParams;
	const user = (await getAuthUser()) as User | null;
	if (!user) return null;

	let conversations = await getConversations();

	const listingId = params.listing;
	let preSelectedConversation: ConversationWithDetails | null = null;
	let initialMessages: Message[] = [];

	if (listingId) {
		preSelectedConversation = await findOrCreateConversation(
			listingId,
			user.id,
			conversations,
		);

		// If a new conversation was created, add it to the list
		if (
			preSelectedConversation &&
			!conversations.some((c) => c.id === preSelectedConversation!.id)
		) {
			conversations = [preSelectedConversation, ...conversations];
		}
	}

	if (preSelectedConversation) {
		initialMessages = await getMessages(preSelectedConversation.id);
	}

	return (
		<MessagesClient
			user={user}
			initialConversations={conversations}
			preSelectedConversation={preSelectedConversation}
			initialMessages={initialMessages}
		/>
	);
}
