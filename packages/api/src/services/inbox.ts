import type { Payload, PayloadRequest } from "payload";
import { isSuspended } from "../access/roles";
import { can, resolveShopRole } from "../access/shopRoles";
import { INBOX_SERVICE_CONTEXT } from "../collections/Conversations";
import { ERROR_CODES } from "../lib/errors";
import {
	INBOX_FILTERS,
	type InboxFilter,
	unreadCountFor,
} from "../lib/inboxFilters";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { Conversation, Message, User } from "../payload-types";
import { recordShopActivity } from "./shopActivity";
import { requireShopPermission } from "./shopGuards";
import { notifyConversationAssigned } from "./shopMemberNotifications";
import { inboxMemberIds } from "./shopMembers";
import type { ServiceUser } from "./shops";

export const INBOX_PAGE_SIZE = 30;

export interface InboxConversationView {
	id: string;
	buyer: { id: string; name: string | null; avatarUrl: string | null } | null;
	listing: { id: string; title: string; thumbnailUrl: string | null } | null;
	lastMessage: { preview: string; at: string; side: "buyer" | "shop" } | null;
	assignee: {
		id: string;
		name: string | null;
		avatarUrl: string | null;
		suspended: boolean;
	} | null;
	inboxStatus: "open" | "done";
	awaitingReply: boolean;
	unreadCount: number;
}

export interface InboxPage {
	docs: InboxConversationView[];
	nextCursor: string | null;
	totals: Record<InboxFilter, number>;
}

const avatarOf = (user: User | undefined | null): string | null => {
	const avatar = user?.avatar;
	return avatar && typeof avatar === "object" && "url" in avatar
		? ((avatar.url as string | null) ?? null)
		: null;
};

const preview = (content: string): string =>
	content.length > 120 ? `${content.slice(0, 120)}...` : content;

async function loadConversation(
	payload: Payload,
	conversationId: string,
	req?: PayloadRequest,
): Promise<Conversation> {
	const conversation = await payload
		.findByID({
			collection: "conversations",
			id: conversationId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!conversation) throw new ServiceError(ERROR_CODES.notFound, 404);
	return conversation as Conversation;
}

/** Narrows `db.updateOne`'s untyped `Document` result, same as `isVariantRow` in `services/stock.ts`. */
function isConversationRow(row: unknown): row is Conversation {
	return typeof row === "object" && row !== null && "id" in row;
}

/** A shop conversation, or a 404: everything in this service is inbox-only. */
async function loadShopConversation(
	payload: Payload,
	conversationId: string,
	req?: PayloadRequest,
): Promise<{ conversation: Conversation; shopId: string }> {
	const conversation = await loadConversation(payload, conversationId, req);
	const shopId = relationId(conversation.shop);
	if (!shopId) throw new ServiceError(ERROR_CODES.notFound, 404);
	return { conversation, shopId };
}

export async function listShopInbox(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	query: { filter?: InboxFilter; q?: string; cursor?: string } = {},
): Promise<InboxPage> {
	await requireShopPermission(payload, user, shopId, "inbox.reply");
	const filter = query.filter ?? "all";

	// Read the shop's conversations once and narrow in memory. A shop inbox is
	// bounded by the shop's buyers, the totals-per-filter the UI needs would
	// otherwise be six count queries, and `unread` cannot be expressed as a
	// `Where` at all.
	const all = (
		await payload.find({
			collection: "conversations",
			where: { shop: { equals: shopId } },
			sort: "-lastMessageAt",
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
		})
	).docs as Conversation[];

	const buyerIds = all.map((c) => relationId(c.buyer) ?? "").filter(Boolean);
	const assigneeIds = all
		.map((c) => relationId(c.assignee) ?? "")
		.filter(Boolean);
	const people = await loadUsers(payload, [...buyerIds, ...assigneeIds]);
	const listings = await loadListings(
		payload,
		all.map((c) => relationId(c.listing) ?? "").filter(Boolean),
	);
	const lastMessages = await loadLastMessages(
		payload,
		all.map((c) => relationId(c.lastMessage) ?? "").filter(Boolean),
	);
	const unread = await loadUnreadCounts(payload, all, user.id);

	const views = all.map((conversation) => {
		const buyerId = relationId(conversation.buyer);
		const assigneeId = relationId(conversation.assignee);
		const listingId = relationId(conversation.listing);
		const messageId = relationId(conversation.lastMessage);
		const message = messageId ? lastMessages.get(messageId) : undefined;
		const assignee = assigneeId ? people.get(assigneeId) : undefined;
		return {
			id: String(conversation.id),
			buyer: buyerId
				? {
						id: buyerId,
						name: people.get(buyerId)?.name ?? null,
						avatarUrl: avatarOf(people.get(buyerId)),
					}
				: null,
			listing: listingId ? (listings.get(listingId) ?? null) : null,
			lastMessage: message
				? {
						preview: preview(String(message.content)),
						at: String(message.createdAt),
						side: (message.senderSide ?? "buyer") as "buyer" | "shop",
					}
				: null,
			// A suspended assignee keeps the assignment; the flag is how the
			// owner sees that nobody is actually working the thread.
			assignee: assigneeId
				? {
						id: assigneeId,
						name: assignee?.name ?? null,
						avatarUrl: avatarOf(assignee),
						suspended: assignee ? isSuspended(assignee) : false,
					}
				: null,
			inboxStatus: (conversation.inboxStatus ?? "open") as "open" | "done",
			awaitingReply: conversation.awaitingReply === true,
			unreadCount: unread.get(String(conversation.id)) ?? 0,
		} satisfies InboxConversationView;
	});

	const matches = (
		view: InboxConversationView,
		target: InboxFilter,
	): boolean => {
		switch (target) {
			case "unassigned":
				return view.assignee === null;
			case "mine":
				return view.assignee?.id === user.id;
			case "unread":
				return view.unreadCount > 0;
			case "awaiting":
				return view.awaitingReply;
			case "done":
				return view.inboxStatus === "done";
			default:
				return true;
		}
	};

	const totals = Object.fromEntries(
		INBOX_FILTERS.map((name) => [
			name,
			views.filter((v) => matches(v, name)).length,
		]),
	) as Record<InboxFilter, number>;

	const needle = query.q?.trim().toLowerCase() ?? "";
	let filtered = views.filter((view) => matches(view, filter));
	if (needle) {
		filtered = filtered.filter(
			(view) =>
				(view.buyer?.name ?? "").toLowerCase().includes(needle) ||
				(view.listing?.title ?? "").toLowerCase().includes(needle),
		);
	}

	// Keyset on `lastMessageAt`, the sort key; `all` is already sorted by it.
	const order = new Map(
		all.map((c) => [String(c.id), String(c.lastMessageAt ?? "")]),
	);
	if (query.cursor) {
		filtered = filtered.filter(
			(view) => (order.get(view.id) ?? "") < (query.cursor ?? ""),
		);
	}

	const page = filtered.slice(0, INBOX_PAGE_SIZE);
	return {
		docs: page,
		nextCursor:
			filtered.length > INBOX_PAGE_SIZE
				? (order.get(page[page.length - 1].id) ?? null)
				: null,
		totals,
	};
}

async function loadUsers(
	payload: Payload,
	ids: string[],
): Promise<Map<string, User>> {
	const unique = [...new Set(ids.filter(Boolean))];
	if (unique.length === 0) return new Map();
	const result = await payload.find({
		collection: "users",
		where: { id: { in: unique } },
		depth: 1,
		limit: unique.length,
		overrideAccess: true,
	});
	return new Map(result.docs.map((doc) => [String(doc.id), doc as User]));
}

async function loadListings(
	payload: Payload,
	ids: string[],
): Promise<
	Map<string, { id: string; title: string; thumbnailUrl: string | null }>
> {
	const unique = [...new Set(ids.filter(Boolean))];
	if (unique.length === 0) return new Map();
	const result = await payload.find({
		collection: "listings",
		where: { id: { in: unique } },
		depth: 2,
		limit: unique.length,
		overrideAccess: true,
	});
	return new Map(
		result.docs.map((doc) => {
			const first = (doc.images ?? [])[0] as
				| { image?: { thumbnailURL?: string | null; url?: string | null } }
				| undefined;
			return [
				String(doc.id),
				{
					id: String(doc.id),
					title: String(doc.title ?? ""),
					thumbnailUrl: first?.image?.thumbnailURL ?? first?.image?.url ?? null,
				},
			];
		}),
	);
}

async function loadLastMessages(
	payload: Payload,
	ids: string[],
): Promise<Map<string, Message>> {
	const unique = [...new Set(ids.filter(Boolean))];
	if (unique.length === 0) return new Map();
	const result = await payload.find({
		collection: "messages",
		where: { id: { in: unique } },
		depth: 0,
		limit: unique.length,
		overrideAccess: true,
	});
	return new Map(result.docs.map((doc) => [String(doc.id), doc as Message]));
}

async function loadUnreadCounts(
	payload: Payload,
	conversations: Conversation[],
	userId: string,
): Promise<Map<string, number>> {
	if (conversations.length === 0) return new Map();
	const ids = conversations.map((c) => String(c.id));

	const reads = await payload.find({
		collection: "conversation-reads",
		where: {
			and: [{ user: { equals: userId } }, { conversation: { in: ids } }],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	const marks = new Map(
		reads.docs.map((row) => [
			relationId(row.conversation) ?? "",
			(row.lastReadAt as string | null) ?? null,
		]),
	);

	const messages = await payload.find({
		collection: "messages",
		where: { conversation: { in: ids } },
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	const byConversation = new Map<
		string,
		Array<{ createdAt: string; sender: string }>
	>();
	for (const message of messages.docs) {
		const key = relationId(message.conversation) ?? "";
		const list = byConversation.get(key) ?? [];
		list.push({
			createdAt: String(message.createdAt),
			sender: relationId(message.sender) ?? "",
		});
		byConversation.set(key, list);
	}

	return new Map(
		ids.map((id) => [
			id,
			unreadCountFor(
				byConversation.get(id) ?? [],
				userId,
				marks.get(id) ?? null,
			),
		]),
	);
}

export async function assignConversation(
	payload: Payload,
	user: ServiceUser,
	conversationId: string,
	userId: string | null,
): Promise<InboxConversationView> {
	const { conversation, shopId } = await loadShopConversation(
		payload,
		conversationId,
	);
	const previousAssignee = relationId(conversation.assignee);

	// Assigning or unassigning yourself needs `inbox.reply`; touching anyone
	// else's assignment needs `inbox.assignOthers`.
	const touchesSomeoneElse =
		(userId !== null && userId !== user.id) ||
		(userId === null &&
			previousAssignee !== null &&
			previousAssignee !== user.id);
	const { shop, role } = await requireShopPermission(
		payload,
		user,
		shopId,
		touchesSomeoneElse ? "inbox.assignOthers" : "inbox.reply",
		{ writable: true },
	);

	if (userId !== null) {
		const eligible = await inboxMemberIds(payload, shopId);
		if (!eligible.includes(userId)) {
			throw new ServiceError(ERROR_CODES.inboxNotAssignable, 409);
		}
	}

	if (previousAssignee === userId) {
		return shapeOne(payload, conversation, user.id);
	}

	const assignedAt = new Date().toISOString();
	const updated = await withTransaction(
		payload,
		async (req) => {
			// Conditional on the assignee the caller decided against: two members
			// clicking at once produce one write, and the loser is handed the
			// winner's state instead of silently overwriting it.
			const row: unknown = await req.payload.db.updateOne({
				collection: "conversations",
				where: {
					and: [
						{ id: { equals: conversationId } },
						previousAssignee
							? { assignee: { equals: previousAssignee } }
							: { assignee: { exists: false } },
					],
				},
				req,
				data: {
					assignee: userId,
					assignedAt: userId ? assignedAt : null,
					assignedBy: userId ? user.id : null,
				},
			});
			if (!isConversationRow(row)) return null;

			await recordShopActivity(req, {
				shop: shopId,
				actor: user.id,
				actorRole: role,
				action: "conversation.assigned",
				targetType: "conversation",
				targetId: conversationId,
				metadata: {
					before: { assignee: previousAssignee },
					after: { assignee: userId },
				},
			});

			if (userId && userId !== user.id) {
				const work = () =>
					notifyConversationAssigned({
						shopId,
						shopName: String(shop.name),
						conversationId,
						assigneeId: userId,
						assignedByName: user.name ?? null,
					});
				if (!onCommit(commitContextOf(req), work)) await work();
			}
			return row;
		},
		{ user, context: INBOX_SERVICE_CONTEXT },
	);

	const current = updated ?? (await loadConversation(payload, conversationId));
	return shapeOne(payload, current, user.id);
}

export async function setConversationStatus(
	payload: Payload,
	user: ServiceUser,
	conversationId: string,
	status: "open" | "done",
): Promise<InboxConversationView> {
	const { conversation, shopId } = await loadShopConversation(
		payload,
		conversationId,
	);
	const { role } = await requireShopPermission(
		payload,
		user,
		shopId,
		"inbox.reply",
		{ writable: true },
	);
	if ((conversation.inboxStatus ?? "open") === status) {
		return shapeOne(payload, conversation, user.id);
	}

	const updated = await withTransaction(
		payload,
		async (req) => {
			const row = (await req.payload.update({
				collection: "conversations",
				id: conversationId,
				req,
				overrideAccess: true,
				context: INBOX_SERVICE_CONTEXT,
				data: { inboxStatus: status },
			})) as Conversation;
			await recordShopActivity(req, {
				shop: shopId,
				actor: user.id,
				actorRole: role,
				action: "conversation.status_changed",
				targetType: "conversation",
				targetId: conversationId,
				metadata: {
					before: { inboxStatus: conversation.inboxStatus ?? "open" },
					after: { inboxStatus: status },
				},
			});
			return row;
		},
		{ user },
	);
	return shapeOne(payload, updated, user.id);
}

async function shapeOne(
	payload: Payload,
	conversation: Conversation,
	viewerId: string,
): Promise<InboxConversationView> {
	const buyerId = relationId(conversation.buyer);
	const assigneeId = relationId(conversation.assignee);
	const listingId = relationId(conversation.listing);
	const messageId = relationId(conversation.lastMessage);
	const people = await loadUsers(payload, [buyerId ?? "", assigneeId ?? ""]);
	const listings = listingId
		? await loadListings(payload, [listingId])
		: new Map();
	const messages = messageId
		? await loadLastMessages(payload, [messageId])
		: new Map();
	const unread = await loadUnreadCounts(payload, [conversation], viewerId);
	const assignee = assigneeId ? people.get(assigneeId) : undefined;
	const message = messageId ? messages.get(messageId) : undefined;

	return {
		id: String(conversation.id),
		buyer: buyerId
			? {
					id: buyerId,
					name: people.get(buyerId)?.name ?? null,
					avatarUrl: avatarOf(people.get(buyerId)),
				}
			: null,
		listing: listingId ? (listings.get(listingId) ?? null) : null,
		lastMessage: message
			? {
					preview: preview(String(message.content)),
					at: String(message.createdAt),
					side: (message.senderSide ?? "buyer") as "buyer" | "shop",
				}
			: null,
		assignee: assigneeId
			? {
					id: assigneeId,
					name: assignee?.name ?? null,
					avatarUrl: avatarOf(assignee),
					suspended: assignee ? isSuspended(assignee) : false,
				}
			: null,
		inboxStatus: (conversation.inboxStatus ?? "open") as "open" | "done",
		awaitingReply: conversation.awaitingReply === true,
		unreadCount: unread.get(String(conversation.id)) ?? 0,
	};
}

export async function markConversationRead(
	payload: Payload,
	actor: { id: string; isService: boolean },
	conversationId: string,
	input: { lastMessageId: string; userId?: string },
): Promise<{ lastReadAt: string; unreadCount: number }> {
	// Only the chat-service token may mark on someone else's behalf; it is the
	// one caller that knows which socket sent `message:read`.
	if (input.userId && input.userId !== actor.id && !actor.isService) {
		throw new ServiceError(ERROR_CODES.forbidden, 403);
	}
	const userId = actor.isService && input.userId ? input.userId : actor.id;

	const conversation = await loadConversation(payload, conversationId);
	const participants = ((conversation.participants ?? []) as unknown[])
		.map(relationId)
		.filter((id): id is string => Boolean(id));
	const shopId = relationId(conversation.shop);

	if (!participants.includes(userId)) {
		const role = shopId ? await resolveShopRole(payload, userId, shopId) : null;
		if (!can(role, "inbox.reply")) {
			throw new ServiceError(ERROR_CODES.messagesNotParticipant, 403);
		}
	}

	const message = await payload
		.findByID({
			collection: "messages",
			id: input.lastMessageId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!message || relationId(message.conversation) !== conversationId) {
		throw new ServiceError(ERROR_CODES.badRequest, 400);
	}
	const lastReadAt = String(message.createdAt);

	return withTransaction(payload, async (req) => {
		const existing = await req.payload.find({
			collection: "conversation-reads",
			where: {
				and: [
					{ conversation: { equals: conversationId } },
					{ user: { equals: userId } },
				],
			},
			depth: 0,
			limit: 1,
			overrideAccess: true,
			req,
		});
		const data = {
			conversation: conversationId,
			user: userId,
			lastReadAt,
			lastReadMessage: input.lastMessageId,
		};
		if (existing.docs[0]) {
			await req.payload.update({
				collection: "conversation-reads",
				id: existing.docs[0].id,
				req,
				overrideAccess: true,
				context: INBOX_SERVICE_CONTEXT,
				data,
			});
		} else {
			await req.payload.create({
				collection: "conversation-reads",
				req,
				overrideAccess: true,
				context: INBOX_SERVICE_CONTEXT,
				data,
			});
		}

		// `messages.read` keeps its old meaning for the other side, so released
		// clients showing a read receipt keep working.
		const unreadFromOthers = await req.payload.find({
			collection: "messages",
			where: {
				and: [
					{ conversation: { equals: conversationId } },
					{ sender: { not_equals: userId } },
					{ read: { equals: false } },
					{ createdAt: { less_than_equal: lastReadAt } },
				],
			},
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			req,
		});
		for (const row of unreadFromOthers.docs) {
			await req.payload.update({
				collection: "messages",
				id: row.id,
				req,
				overrideAccess: true,
				context: INBOX_SERVICE_CONTEXT,
				data: { read: true },
			});
		}

		return { lastReadAt, unreadCount: 0 };
	});
}

export async function startConversation(
	payload: Payload,
	user: ServiceUser,
	listingId: string,
): Promise<{ conversationId: string; created: boolean }> {
	const listing = await payload
		.findByID({
			collection: "listings",
			id: listingId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!listing) throw new ServiceError(ERROR_CODES.listingNotFound, 404);

	const shopId = relationId(listing.shop);
	const sellerId = relationId(listing.seller);

	if (!shopId) {
		// Classic listing: the released find-or-create by participants, moved
		// server-side so both clients stop building it themselves.
		if (!sellerId || sellerId === user.id) {
			throw new ServiceError(ERROR_CODES.messagesNotParticipant, 403);
		}
		const existing = await payload.find({
			collection: "conversations",
			where: {
				and: [
					{ participants: { equals: user.id } },
					{ participants: { equals: sellerId } },
					{ shop: { exists: false } },
				],
			},
			depth: 0,
			limit: 1,
			overrideAccess: true,
		});
		if (existing.docs[0]) {
			return { conversationId: String(existing.docs[0].id), created: false };
		}
		// Through `withTransaction`, because `Conversations.beforeChange` reads
		// `req.user` to check the caller is among the participants, and
		// `payload.create` has no `user` option — only a `req` carries one.
		const created = await withTransaction(
			payload,
			(req) =>
				req.payload.create({
					collection: "conversations",
					req,
					overrideAccess: true,
					data: { participants: [user.id, sellerId], listing: listingId },
				}),
			{ user: { id: user.id } },
		);
		return { conversationId: String(created.id), created: true };
	}

	// A member cannot open a buyer conversation with their own shop, and a
	// dormant shop refuses one too — checked before the dedupe lookup below, so
	// neither rule is silently bypassed by an existing thread from before the
	// shop went inactive.
	const shop = await payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const role = await resolveShopRole(payload, user.id, shopId);
	if (role) throw new ServiceError(ERROR_CODES.messagesNotParticipant, 403);
	if (!shop || shop.status !== "active") {
		throw new ServiceError(ERROR_CODES.shopInactive, 409);
	}

	// One thread per (shop, buyer), whatever the listing. A buyer asking about
	// a second item of the same shop continues the conversation the shop
	// already has with them.
	const existing = await payload.find({
		collection: "conversations",
		where: {
			and: [{ shop: { equals: shopId } }, { buyer: { equals: user.id } }],
		},
		depth: 0,
		limit: 1,
		overrideAccess: true,
	});
	if (existing.docs[0]) {
		return { conversationId: String(existing.docs[0].id), created: false };
	}

	const ownerId = relationId(shop.owner);
	// The hook re-asserts `shop`, `buyer` and `participants` from the listing
	// on every write path that is not this service, so setting them here and
	// letting the hook idempotently confirm them keeps the rule in one place
	// for every other caller while this service does not depend on it.
	const created = await withTransaction(
		payload,
		(req) =>
			req.payload.create({
				collection: "conversations",
				req,
				overrideAccess: true,
				data: {
					participants: ownerId ? [user.id, ownerId] : [user.id],
					listing: listingId,
					shop: shopId,
					buyer: user.id,
					inboxStatus: "open",
					awaitingReply: false,
				},
			}),
		{ user: { id: user.id } },
	);
	return { conversationId: String(created.id), created: true };
}
