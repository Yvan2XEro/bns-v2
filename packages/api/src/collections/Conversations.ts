import type { CollectionConfig, Where } from "payload";
import { authenticated } from "../access/authenticated";
import { inboxShopIds } from "../access/inboxShops";
import { isAdmin, isModerator } from "../access/roles";
import { resolveShopRole } from "../access/shopRoles";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { CodedAPIError } from "../lib/serviceError";

export const INBOX_SERVICE_CONTEXT = { inboxService: true } as const;

/**
 * Set by `services/inbox.ts` and by `Messages.afterChange`. Everything else —
 * a member's own PATCH, a buyer's, the admin panel's — is pinned back to the
 * stored values below, because a participant could otherwise rewrite
 * `participants` and read themselves into someone else's thread.
 */
const PINNED_FIELDS = [
	"participants",
	"shop",
	"buyer",
	"assignee",
	"assignedAt",
	"assignedBy",
	"inboxStatus",
	"awaitingReply",
	"order",
] as const;

export const Conversations: CollectionConfig = {
	slug: "conversations",
	admin: {
		useAsTitle: "id",
		defaultColumns: [
			"participants",
			"shop",
			"listing",
			"inboxStatus",
			"lastMessageAt",
		],
	},
	access: {
		read: async ({ req }) => {
			if (!req.user) return false;
			if (isModerator(req.user as { role?: string })) return true;
			const own = { participants: { equals: req.user.id } };
			const shops = await inboxShopIds(req);
			if (shops.length === 0) return own as Where;
			return { or: [own, { shop: { in: shops } }] } as Where;
		},
		create: authenticated,
		update: ({ req: { user } }) => {
			if (!user) return false;
			if (isAdmin(user as { role?: string })) return true;
			return { participants: { equals: user.id } } as Where;
		},
		delete: ({ req: { user } }) => {
			if (!user) return false;
			if (isAdmin(user as { role?: string })) return true;
			return { participants: { equals: user.id } } as Where;
		},
	},
	indexes: [{ fields: ["shop", "buyer"] }],
	hooks: {
		beforeChange: [
			async ({ data, operation, originalDoc, req }) => {
				if (req.context?.inboxService === true) return data;

				if (operation === "update") {
					// Re-pin rather than refuse: a released client PATCHes the
					// whole document back, and refusing would break it. The
					// writable pair (`lastMessage`, `lastMessageAt`) is what
					// chat-service actually needs.
					//
					// Pinned unconditionally, including when the key is absent
					// from `originalDoc` altogether: Mongo stores no key for an
					// unset relationship, so `field in originalDoc` is false on
					// a classic conversation's `shop`/`buyer` and on an
					// unassigned shop conversation's `assignee`/`assignedAt`/
					// `assignedBy` — and a conditional pin leaves exactly those
					// writable by any participant.
					for (const field of PINNED_FIELDS) {
						(data as Record<string, unknown>)[field] =
							(originalDoc as Record<string, unknown> | undefined)?.[field] ??
							null;
					}
					return data;
				}
				if (operation !== "create") return data;

				const callerId = relationId(req.user);
				const participants = ((data.participants ?? []) as unknown[])
					.map(relationId)
					.filter((id): id is string => Boolean(id));
				if (!callerId || !participants.includes(callerId)) {
					throw new CodedAPIError(ERROR_CODES.messagesNotParticipant, 403);
				}

				const listingId = relationId(data.listing);
				if (!listingId) return data;
				const listing = await req.payload
					.findByID({
						collection: "listings",
						id: listingId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null);
				const shopId = relationId(listing?.shop);
				if (!shopId) return data;

				// A member cannot open a buyer conversation with their own shop:
				// it would land in the inbox they themselves answer, and
				// `participants` would put them on both sides.
				const role = await resolveShopRole(
					req.payload,
					callerId,
					shopId,
					req.context,
				);
				if (role) {
					throw new CodedAPIError(ERROR_CODES.messagesNotParticipant, 403);
				}

				const shop = await req.payload
					.findByID({
						collection: "shops",
						id: shopId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null);
				if (!shop || shop.status !== "active") {
					throw new CodedAPIError(ERROR_CODES.shopInactive, 409);
				}

				const ownerId = relationId(shop.owner);
				data.shop = shopId;
				data.buyer = callerId;
				// Always `[buyer, owner]`: other members reach the conversation
				// through membership, so revoking one never has to rewrite a
				// conversation document.
				data.participants = ownerId ? [callerId, ownerId] : [callerId];
				data.inboxStatus = "open";
				data.awaitingReply = false;
				return data;
			},
		],
	},
	fields: [
		{
			name: "participants",
			type: "relationship",
			relationTo: "users",
			hasMany: true,
			required: true,
		},
		{ name: "listing", type: "relationship", relationTo: "listings" },
		{ name: "lastMessage", type: "relationship", relationTo: "messages" },
		{
			name: "shop",
			type: "relationship",
			relationTo: "shops",
			index: true,
			admin: { readOnly: true },
		},
		{
			name: "buyer",
			type: "relationship",
			relationTo: "users",
			index: true,
			admin: { readOnly: true },
		},
		{
			// Set once by `services/orders/chat.ts` (a later task) when the
			// conversation is created for an order; pinned afterwards like
			// `shop`/`buyer`. Not declared `unique`: the order service is the
			// collection's sole writer of this field, so there is no concurrent
			// REST race for a database-level constraint to close, unlike
			// `carts`/`orders`/`commission-lines` in the P4 index migration.
			name: "order",
			type: "relationship",
			relationTo: "orders",
			index: true,
			admin: { readOnly: true },
		},
		{
			name: "assignee",
			type: "relationship",
			relationTo: "users",
			index: true,
			admin: { readOnly: true },
		},
		{ name: "assignedAt", type: "date", admin: { readOnly: true } },
		{
			name: "assignedBy",
			type: "relationship",
			relationTo: "users",
			admin: { readOnly: true },
		},
		{
			name: "inboxStatus",
			type: "select",
			defaultValue: "open",
			index: true,
			options: [
				{ label: "Open", value: "open" },
				{ label: "Done", value: "done" },
			],
		},
		{ name: "lastMessageAt", type: "date", index: true },
		{ name: "awaitingReply", type: "checkbox", defaultValue: false },
		{ name: "updatedAt", type: "date", admin: { readOnly: true } },
	],
	timestamps: true,
};
