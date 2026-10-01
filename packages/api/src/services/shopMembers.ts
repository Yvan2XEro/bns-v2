import type { Payload, PayloadRequest, Where } from "payload";
import { isSuspended } from "../access/roles";
import { can, resolveShopRole, type ShopRole } from "../access/shopRoles";
import { INBOX_SERVICE_CONTEXT } from "../collections/Conversations";
import { INBOX_NOTIFICATION_PREFERENCES } from "../collections/ShopMembers";
import { queueMembershipChange } from "../hooks/membershipEvents";
import { ERROR_CODES } from "../lib/errors";
import {
	type InvitationChannel,
	maskTarget,
	normalizeInvitationTarget,
	pendingKeyFor,
} from "../lib/invitationTargets";
import {
	createInvitationToken,
	hashInvitationToken,
	INVITATION_RESEND_COOLDOWN_MS,
	invitationExpiresAt,
	isInvitationUsable,
	MAX_INVITATION_SENDS,
} from "../lib/invitationTokens";
import {
	type CounterStore,
	getCounterStore,
	hitRateLimit,
	type RateLimitWindow,
} from "../lib/rateLimit";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	type ShopCapabilities,
	shopCapabilities,
} from "../lib/shopCapabilities";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../lib/transactions";
import type { Shop, ShopInvitation, ShopMember, User } from "../payload-types";
import { recordShopActivity } from "./shopActivity";
import { findShop, requireShopPermission } from "./shopGuards";
import {
	notifyInvitationAccepted,
	notifyInvitationDeclined,
	notifyMemberRemoved,
	notifyMemberRoleChanged,
	notifyShopInvitation,
} from "./shopMemberNotifications";
import type { ServiceUser } from "./shops";
import { isUniqueViolation } from "./shops";
import { sendSms } from "./smsProvider";

export const SHOP_MEMBER_CONTEXT = { shopMemberService: true } as const;

export const INVITES_PER_SHOP_PER_DAY = 20;
export const INVITE_LIMITS: readonly RateLimitWindow[] = [
	{
		name: "shop-invite:day",
		limit: INVITES_PER_SHOP_PER_DAY,
		windowSeconds: 86_400,
	},
];

export interface ShopMemberDeps {
	store?: CounterStore;
	now?: Date;
}

const webUrl = () => process.env.PUBLIC_WEB_URL ?? "https://buynsellem.com";
const firstName = (name: string | null | undefined) =>
	(name ?? "").trim().split(/\s+/)[0] || null;

/** `pending` past its date is treated as expired everywhere, without a write. */
function liveInvitations(shopId: string, now: Date): Where {
	const and: Where[] = [
		{ shop: { equals: shopId } },
		{ status: { equals: "pending" } },
		{ expiresAt: { greater_than: now.toISOString() } },
	];
	return { and };
}

async function activeMembers(
	payload: Payload,
	shopId: string,
	req?: PayloadRequest,
): Promise<ShopMember[]> {
	const result = await payload.find({
		collection: "shop-members",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
		},
		sort: "joinedAt",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});
	return result.docs as ShopMember[];
}

/**
 * Seats taken: active members (the owner included) plus every pending
 * invitation that has not expired. Counting pending invitations is what stops
 * a shop from inviting twenty people into five seats and letting the race
 * decide who gets in.
 */
async function seatsTaken(
	payload: Payload,
	shopId: string,
	now: Date,
	options: { exceptInvitationId?: string; req?: PayloadRequest } = {},
): Promise<number> {
	const members = await payload.count({
		collection: "shop-members",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
		},
		req: options.req,
	});
	const invitations = await payload.find({
		collection: "shop-invitations",
		where: liveInvitations(shopId, now),
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req: options.req,
	});
	const pending = invitations.docs.filter(
		(doc) => String(doc.id) !== options.exceptInvitationId,
	).length;
	return members.totalDocs + pending;
}

async function assertTeamEnabled(shop: Shop, now: Date): Promise<void> {
	if (shop.status !== "active") {
		throw new ServiceError(ERROR_CODES.shopInactive, 409);
	}
	if (!shopCapabilities(shop, now).teamMembers) {
		throw new ServiceError(ERROR_CODES.teamLevelRequired, 403);
	}
}

/** The invite permission depends on the role being invited. */
function invitePermissionFor(role: "manager" | "staff") {
	return role === "manager" ? "team.manageManagers" : "team.inviteStaff";
}

function parseInviteRole(raw: unknown): "manager" | "staff" {
	if (raw === "manager" || raw === "staff") return raw;
	throw new ServiceError(ERROR_CODES.badRequest, 400);
}

function parseChannel(raw: unknown): InvitationChannel {
	if (raw === "phone" || raw === "email") return raw;
	throw new ServiceError(ERROR_CODES.badRequest, 400);
}

function defaultPreference(role: ShopRole): "all" | "assigned" {
	// The owner and managers watch the whole inbox; staff hear about what is
	// theirs. Both are editable by the member afterwards.
	return role === "staff" ? "assigned" : "all";
}

function isInboxPreference(
	value: unknown,
): value is (typeof INBOX_NOTIFICATION_PREFERENCES)[number] {
	return (
		typeof value === "string" &&
		(INBOX_NOTIFICATION_PREFERENCES as readonly string[]).includes(value)
	);
}

export interface TeamMemberView {
	id: string;
	userId: string;
	name: string | null;
	avatarUrl: string | null;
	role: ShopRole;
	joinedAt: string | null;
	suspended: boolean;
	inboxNotifications?: "all" | "assigned" | "none";
}

export interface PendingInvitationView {
	id: string;
	role: "manager" | "staff";
	channel: InvitationChannel;
	maskedTarget: string;
	expiresAt: string;
	sendCount: number;
	lastSentAt: string | null;
	invitedByName: string | null;
}

export interface TeamView {
	members: TeamMemberView[];
	invitations: PendingInvitationView[];
	activeCount: number;
	maxMembers: number;
	teamMembers: boolean;
}

async function usersById(
	payload: Payload,
	ids: string[],
	req?: PayloadRequest,
): Promise<Map<string, User>> {
	const unique = [...new Set(ids.filter(Boolean))];
	if (unique.length === 0) return new Map();
	const result = await payload.find({
		collection: "users",
		where: { id: { in: unique } },
		depth: 1,
		limit: unique.length,
		overrideAccess: true,
		req,
	});
	return new Map(result.docs.map((doc) => [String(doc.id), doc as User]));
}

const avatarOf = (user: User | undefined): string | null => {
	const avatar = user?.avatar;
	return avatar && typeof avatar === "object" && "url" in avatar
		? ((avatar.url as string | null) ?? null)
		: null;
};

function memberView(
	row: ShopMember,
	user: User | undefined,
	now: Date,
	includePreference: boolean,
): TeamMemberView {
	return {
		id: String(row.id),
		userId: relationId(row.user) ?? "",
		name: user?.name ?? null,
		avatarUrl: avatarOf(user),
		role: row.role as ShopRole,
		joinedAt: (row.joinedAt as string | null) ?? null,
		suspended: user ? isSuspended(user, now) : false,
		...(includePreference
			? {
					inboxNotifications: (row.inboxNotifications ??
						"all") as TeamMemberView["inboxNotifications"],
				}
			: {}),
	};
}

export async function getShopTeam(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	now: Date = new Date(),
): Promise<TeamView> {
	const { shop, role } = await requireShopPermission(
		payload,
		user,
		shopId,
		"team.view",
	);
	const members = await activeMembers(payload, shopId);
	const profiles = await usersById(
		payload,
		members.map((row) => relationId(row.user) ?? ""),
	);
	// A manager needs everyone's preference to understand who a buyer message
	// reached; a staff member sees only their own.
	const seesAll = can(role, "team.inviteStaff");

	const invitationRows = can(role, "team.view")
		? ((
				await payload.find({
					collection: "shop-invitations",
					where: liveInvitations(shopId, now),
					sort: "-createdAt",
					depth: 0,
					limit: 0,
					pagination: false,
					overrideAccess: true,
				})
			).docs as ShopInvitation[])
		: [];
	const inviters = await usersById(
		payload,
		invitationRows.map((row) => relationId(row.invitedBy) ?? ""),
	);

	return {
		members: members.map((row) =>
			memberView(
				row,
				profiles.get(relationId(row.user) ?? ""),
				now,
				seesAll || relationId(row.user) === user.id,
			),
		),
		invitations: invitationRows.map((row) => ({
			id: String(row.id),
			role: row.role as "manager" | "staff",
			channel: row.channel as InvitationChannel,
			maskedTarget: maskTarget(
				row.channel as InvitationChannel,
				String(row.channel === "phone" ? row.phone : row.email),
			),
			expiresAt: String(row.expiresAt),
			sendCount: Number(row.sendCount ?? 1),
			lastSentAt: (row.lastSentAt as string | null) ?? null,
			invitedByName:
				inviters.get(relationId(row.invitedBy) ?? "")?.name ?? null,
		})),
		activeCount: members.length,
		maxMembers: shopCapabilities(shop, now).maxMembers,
		teamMembers: shopCapabilities(shop, now).teamMembers,
	};
}

/**
 * The user ids chat-service and the notification router treat as "the shop
 * side". Goes through `resolveShopRole` per member rather than reading roles
 * off the rows, so the suspension and dormancy rules apply identically here
 * and at `message:send`.
 */
export async function inboxMemberIds(
	payload: Payload,
	shopId: string,
	req?: PayloadRequest,
): Promise<string[]> {
	const shop = await payload
		.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!shop || shop.status !== "active") return [];

	const context: Record<string, unknown> = {};
	const ids: string[] = [];
	for (const row of await activeMembers(payload, shopId, req)) {
		const userId = relationId(row.user);
		if (!userId) continue;
		const role = await resolveShopRole(payload, userId, shopId, context);
		if (can(role, "inbox.reply")) ids.push(userId);
	}
	return ids;
}

export interface MyShopsEntry {
	shopId: string;
	name: string;
	handle: string;
	logoUrl: string | null;
	role: ShopRole;
	capabilities: ShopCapabilities;
	inboxUnread: number;
}

export async function listMyShops(
	payload: Payload,
	user: ServiceUser,
	now: Date = new Date(),
): Promise<MyShopsEntry[]> {
	const rows = await payload.find({
		collection: "shop-members",
		where: {
			and: [{ user: { equals: user.id } }, { status: { equals: "active" } }],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});

	const context: Record<string, unknown> = {};
	const entries: MyShopsEntry[] = [];
	for (const row of rows.docs) {
		const shopId = relationId(row.shop);
		if (!shopId) continue;
		const role = await resolveShopRole(payload, user.id, shopId, context);
		if (!role) continue;
		const shop = await payload
			.findByID({
				collection: "shops",
				id: shopId,
				depth: 1,
				overrideAccess: true,
			})
			.catch(() => null);
		if (!shop) continue;
		const logo = shop.logo;
		entries.push({
			shopId,
			name: String(shop.name),
			handle: String(shop.handle),
			logoUrl:
				logo && typeof logo === "object" && "url" in logo
					? ((logo.url as string | null) ?? null)
					: null,
			role,
			capabilities: shopCapabilities(shop, now),
			inboxUnread: can(role, "inbox.reply")
				? await countInboxUnread(payload, shopId, user.id)
				: 0,
		});
	}
	return entries;
}

/**
 * Conversations of the shop with at least one message the caller has not
 * read. Counted as conversations, not messages: it drives a badge, and
 * "4 conversations waiting" is the number a member acts on.
 */
async function countInboxUnread(
	payload: Payload,
	shopId: string,
	userId: string,
): Promise<number> {
	const conversations = await payload.find({
		collection: "conversations",
		where: {
			and: [{ shop: { equals: shopId } }, { awaitingReply: { equals: true } }],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	if (conversations.docs.length === 0) return 0;

	const reads = await payload.find({
		collection: "conversation-reads",
		where: {
			and: [
				{ user: { equals: userId } },
				{ conversation: { in: conversations.docs.map((c) => String(c.id)) } },
			],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	const lastRead = new Map(
		reads.docs.map((row) => [
			relationId(row.conversation) ?? "",
			(row.lastReadAt as string | null) ?? null,
		]),
	);

	return conversations.docs.filter((conversation) => {
		const at = lastRead.get(String(conversation.id));
		if (!at) return true;
		const last = conversation.lastMessageAt as string | null;
		return Boolean(last) && Date.parse(String(last)) > Date.parse(at);
	}).length;
}

export interface InviteInput {
	channel: unknown;
	phone?: unknown;
	email?: unknown;
	role: unknown;
}

function invitationView(
	row: ShopInvitation,
	inviterName: string | null,
): PendingInvitationView {
	const channel = row.channel as InvitationChannel;
	return {
		id: String(row.id),
		role: row.role as "manager" | "staff",
		channel,
		maskedTarget: maskTarget(
			channel,
			String(channel === "phone" ? row.phone : row.email),
		),
		expiresAt: String(row.expiresAt),
		sendCount: Number(row.sendCount ?? 1),
		lastSentAt: (row.lastSentAt as string | null) ?? null,
		invitedByName: inviterName,
	};
}

/** Bilingual in one message, because the invitee's language is unknown. */
function inviteSmsText(
	inviter: string,
	shopName: string,
	token: string,
): string {
	return `${inviter} vous invite a rejoindre ${shopName} sur BuyNSellem / invites you to join ${shopName}: ${webUrl()}/invite/${token}`;
}

async function deliverInvitation(
	payload: Payload,
	input: {
		channel: InvitationChannel;
		target: string;
		token: string;
		invitationId: string;
		shopId: string;
		shopName: string;
		inviterName: string | null;
		role: "manager" | "staff";
	},
): Promise<boolean> {
	// A delivery failure keeps the invitation: the inviter resends rather than
	// starting again, and a pending row with no message sent is still a seat
	// that has been reserved.
	try {
		const existing = await payload.find({
			collection: "users",
			where:
				input.channel === "phone"
					? {
							and: [
								{ phone: { equals: input.target } },
								{ phoneVerifiedAt: { exists: true } },
							],
						}
					: { email: { equals: input.target } },
			depth: 0,
			limit: 1,
			overrideAccess: true,
		});
		const existingUserId = existing.docs[0]
			? String(existing.docs[0].id)
			: null;

		if (input.channel === "phone") {
			await sendSms(payload, {
				to: input.target,
				message: inviteSmsText(
					input.inviterName ?? input.shopName,
					input.shopName,
					input.token,
				),
			});
		}
		await notifyShopInvitation({
			invitationId: input.invitationId,
			shopId: input.shopId,
			shopName: input.shopName,
			inviterName: input.inviterName,
			role: input.role,
			channel: input.channel,
			target: input.target,
			token: input.token,
			existingUserId,
		});
		return true;
	} catch (error) {
		payload.logger.error(
			{ err: error, invitationId: input.invitationId },
			"[shopMembers] invitation delivery failed; the invitation stays pending",
		);
		return false;
	}
}

export async function inviteMember(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: InviteInput,
	deps: ShopMemberDeps = {},
): Promise<{ invitation: PendingInvitationView; delivered: boolean }> {
	const now = deps.now ?? new Date();
	const role = parseInviteRole(input.role);
	const channel = parseChannel(input.channel);

	const { shop } = await requireShopPermission(
		payload,
		user,
		shopId,
		invitePermissionFor(role),
		{ writable: true },
	);
	await assertTeamEnabled(shop, now);

	const target = normalizeInvitationTarget(
		channel,
		channel === "phone" ? input.phone : input.email,
	);

	// Counted before any lookup, so a caller cannot probe which numbers are
	// already members by watching which calls are cheap.
	if (
		await hitRateLimit(
			deps.store ?? getCounterStore(),
			`shop-invite:${shopId}`,
			INVITE_LIMITS,
			now.getTime(),
		)
	) {
		throw new ServiceError(ERROR_CODES.rateLimited, 429);
	}

	const inviter = await payload.findByID({
		collection: "users",
		id: user.id,
		depth: 0,
		overrideAccess: true,
	});
	const selfTarget =
		channel === "phone"
			? (inviter.phone ?? null)
			: (inviter.email ?? "").toLowerCase();
	if (selfTarget && selfTarget === target) {
		throw new ServiceError(ERROR_CODES.teamCannotInviteSelf, 400);
	}

	const holder = await payload.find({
		collection: "users",
		where:
			channel === "phone"
				? {
						and: [
							{ phone: { equals: target } },
							{ phoneVerifiedAt: { exists: true } },
						],
					}
				: { email: { equals: target } },
		depth: 0,
		limit: 1,
		overrideAccess: true,
	});
	if (holder.docs[0]) {
		const existingRole = await resolveShopRole(
			payload,
			String(holder.docs[0].id),
			shopId,
		);
		const row = await payload.find({
			collection: "shop-members",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ user: { equals: String(holder.docs[0].id) } },
					{ status: { equals: "active" } },
				],
			},
			depth: 0,
			limit: 1,
			overrideAccess: true,
		});
		// Dormant counts as a member: the row exists and will wake up.
		if (existingRole || row.docs.length > 0) {
			throw new ServiceError(ERROR_CODES.teamAlreadyMember, 409);
		}
	}

	const pendingKey = pendingKeyFor(shopId, channel, target);
	const clash = await payload.find({
		collection: "shop-invitations",
		where: {
			and: [
				{ pendingKey: { equals: pendingKey } },
				{ status: { equals: "pending" } },
			],
		},
		depth: 0,
		limit: 1,
		overrideAccess: true,
	});
	if (clash.docs.some((doc) => isInvitationUsable(doc as never, now))) {
		throw new ServiceError(ERROR_CODES.teamInvitationPending, 409);
	}

	const capabilities = shopCapabilities(shop, now);
	if ((await seatsTaken(payload, shopId, now)) >= capabilities.maxMembers) {
		throw new ServiceError(ERROR_CODES.teamLimitReached, 409);
	}

	const { token, tokenHash } = createInvitationToken();
	const created = await withTransaction(
		payload,
		async (req) => {
			let invitation: ShopInvitation;
			try {
				invitation = (await req.payload.create({
					collection: "shop-invitations",
					req,
					overrideAccess: true,
					context: SHOP_MEMBER_CONTEXT,
					data: {
						shop: shopId,
						role,
						channel,
						phone: channel === "phone" ? target : null,
						email: channel === "email" ? target : null,
						pendingKey,
						tokenHash,
						status: "pending",
						invitedBy: user.id,
						expiresAt: invitationExpiresAt(now),
						sendCount: 1,
						lastSentAt: now.toISOString(),
					},
				})) as ShopInvitation;
			} catch (error) {
				// The partial unique index on `pendingKey` is what closes the gap
				// between the read above and this write.
				if (isUniqueViolation(error)) {
					throw new ServiceError(ERROR_CODES.teamInvitationPending, 409);
				}
				throw error;
			}

			await recordShopActivity(req, {
				shop: shopId,
				actor: user.id,
				actorRole:
					(await resolveShopRole(payload, user.id, shopId, req.context)) ??
					"owner",
				action: "member.invited",
				targetType: "invitation",
				targetId: String(invitation.id),
				metadata: { role, channel, maskedTarget: maskTarget(channel, target) },
			});
			return invitation;
		},
		{ user },
	);

	const delivered = await deliverInvitation(payload, {
		channel,
		target,
		token,
		invitationId: String(created.id),
		shopId,
		shopName: String(shop.name),
		inviterName: inviter.name ?? null,
		role,
	});

	return {
		invitation: invitationView(created, inviter.name ?? null),
		delivered,
	};
}

export async function resendInvitation(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	invitationId: string,
	deps: ShopMemberDeps = {},
): Promise<{ invitation: PendingInvitationView; delivered: boolean }> {
	const now = deps.now ?? new Date();
	const existing = (await payload
		.findByID({
			collection: "shop-invitations",
			id: invitationId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null)) as ShopInvitation | null;
	if (!existing || relationId(existing.shop) !== shopId) {
		throw new ServiceError(ERROR_CODES.teamInvitationInvalid, 409);
	}

	const role = existing.role as "manager" | "staff";
	const { shop } = await requireShopPermission(
		payload,
		user,
		shopId,
		invitePermissionFor(role),
		{ writable: true },
	);
	await assertTeamEnabled(shop, now);

	if (!isInvitationUsable(existing as never, now)) {
		throw new ServiceError(ERROR_CODES.teamInvitationInvalid, 409);
	}
	if (Number(existing.sendCount ?? 1) >= MAX_INVITATION_SENDS) {
		throw new ServiceError(ERROR_CODES.teamResendLimit, 429);
	}
	const lastSentAt = existing.lastSentAt
		? Date.parse(String(existing.lastSentAt))
		: 0;
	if (now.getTime() - lastSentAt < INVITATION_RESEND_COOLDOWN_MS) {
		throw new ServiceError(ERROR_CODES.teamResendLimit, 429);
	}

	const channel = existing.channel as InvitationChannel;
	const target = String(channel === "phone" ? existing.phone : existing.email);
	// A new token replaces the old hash in the same write, so the link already
	// sitting in the invitee's SMS inbox resolves to nothing from now on.
	const { token, tokenHash } = createInvitationToken();

	const updated = await withTransaction(
		payload,
		async (req) => {
			const row = (await req.payload.update({
				collection: "shop-invitations",
				id: invitationId,
				req,
				overrideAccess: true,
				context: SHOP_MEMBER_CONTEXT,
				data: {
					tokenHash,
					sendCount: Number(existing.sendCount ?? 1) + 1,
					lastSentAt: now.toISOString(),
					expiresAt: invitationExpiresAt(now),
				},
			})) as ShopInvitation;
			await recordShopActivity(req, {
				shop: shopId,
				actor: user.id,
				actorRole:
					(await resolveShopRole(payload, user.id, shopId, req.context)) ??
					"owner",
				action: "member.invitation_resent",
				targetType: "invitation",
				targetId: invitationId,
				metadata: { sendCount: Number(existing.sendCount ?? 1) + 1 },
			});
			return row;
		},
		{ user },
	);

	const inviter = await payload
		.findByID({
			collection: "users",
			id: user.id,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const delivered = await deliverInvitation(payload, {
		channel,
		target,
		token,
		invitationId,
		shopId,
		shopName: String(shop.name),
		inviterName: inviter?.name ?? null,
		role,
	});

	return {
		invitation: invitationView(updated, inviter?.name ?? null),
		delivered,
	};
}

export async function revokeInvitation(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	invitationId: string,
): Promise<{ revoked: true }> {
	const existing = (await payload
		.findByID({
			collection: "shop-invitations",
			id: invitationId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null)) as ShopInvitation | null;
	if (!existing || relationId(existing.shop) !== shopId) {
		throw new ServiceError(ERROR_CODES.teamInvitationInvalid, 409);
	}
	if (existing.status !== "pending") {
		throw new ServiceError(ERROR_CODES.teamInvitationInvalid, 409);
	}
	await requireShopPermission(
		payload,
		user,
		shopId,
		invitePermissionFor(existing.role as "manager" | "staff"),
		{ writable: true },
	);

	await withTransaction(
		payload,
		async (req) => {
			await req.payload.update({
				collection: "shop-invitations",
				id: invitationId,
				req,
				overrideAccess: true,
				context: SHOP_MEMBER_CONTEXT,
				// `pendingKey` is cleared so the partial unique index releases the
				// target and the same person can be invited again.
				data: {
					status: "revoked",
					pendingKey: null,
					respondedAt: new Date().toISOString(),
				},
			});
			await recordShopActivity(req, {
				shop: shopId,
				actor: user.id,
				actorRole:
					(await resolveShopRole(payload, user.id, shopId, req.context)) ??
					"owner",
				action: "member.invitation_revoked",
				targetType: "invitation",
				targetId: invitationId,
			});
		},
		{ user },
	);
	return { revoked: true as const };
}

export interface PublicInvitationView {
	shop: {
		name: string;
		handle: string;
		logoUrl: string | null;
		badge: "phone" | "identity" | "business" | null;
	};
	role: "manager" | "staff";
	channel: InvitationChannel;
	maskedTarget: string;
	inviterFirstName: string | null;
	expiresAt: string;
	status: "pending" | "accepted" | "declined" | "revoked" | "expired";
}

async function byToken(
	payload: Payload,
	token: string,
	req?: PayloadRequest,
): Promise<ShopInvitation | null> {
	if (typeof token !== "string" || token.length === 0) return null;
	const result = await payload.find({
		collection: "shop-invitations",
		where: { tokenHash: { equals: hashInvitationToken(token) } },
		depth: 0,
		limit: 1,
		overrideAccess: true,
		req,
	});
	return (result.docs[0] as ShopInvitation | undefined) ?? null;
}

export async function lookupInvitation(
	payload: Payload,
	token: string,
	now: Date = new Date(),
): Promise<PublicInvitationView> {
	const invitation = await byToken(payload, token);
	if (!invitation) {
		// 404, not 403: an unknown token must not tell a guesser whether the
		// value existed and was merely consumed.
		throw new ServiceError(ERROR_CODES.teamInvitationInvalid, 404);
	}
	const shop = await findShop(payload, relationId(invitation.shop) ?? "");
	const inviter = await payload
		.findByID({
			collection: "users",
			id: relationId(invitation.invitedBy) ?? "",
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const channel = invitation.channel as InvitationChannel;
	const logo = shop.logo;

	return {
		shop: {
			name: String(shop.name),
			handle: String(shop.handle),
			logoUrl:
				logo && typeof logo === "object" && "url" in logo
					? ((logo.url as string | null) ?? null)
					: null,
			badge: shopCapabilities(shop, now).badge,
		},
		role: invitation.role as "manager" | "staff",
		channel,
		maskedTarget: maskTarget(
			channel,
			String(channel === "phone" ? invitation.phone : invitation.email),
		),
		inviterFirstName: firstName(inviter?.name),
		expiresAt: String(invitation.expiresAt),
		// Derived, never written: a pending row past its date reads as expired
		// without waiting for a job.
		status:
			invitation.status === "pending" &&
			!isInvitationUsable(invitation as never, now)
				? "expired"
				: (invitation.status as PublicInvitationView["status"]),
	};
}

export async function acceptInvitation(
	payload: Payload,
	user: ServiceUser,
	token: string,
	now: Date = new Date(),
): Promise<{ shopId: string; role: ShopRole }> {
	const tokenHash = hashInvitationToken(token);

	return withTransaction(
		payload,
		async (req) => {
			const found = await req.payload.find({
				collection: "shop-invitations",
				where: { tokenHash: { equals: tokenHash } },
				depth: 0,
				limit: 1,
				overrideAccess: true,
				req,
			});
			const invitation = found.docs[0] as ShopInvitation | undefined;
			if (!invitation || !isInvitationUsable(invitation as never, now)) {
				throw new ServiceError(ERROR_CODES.teamInvitationInvalid, 409);
			}

			const shopId = relationId(invitation.shop) ?? "";
			const channel = invitation.channel as InvitationChannel;
			const role = invitation.role as "manager" | "staff";

			const account = await req.payload.findByID({
				collection: "users",
				id: user.id,
				depth: 0,
				overrideAccess: true,
				req,
			});

			if (channel === "phone") {
				// The proof is a verified number matching the invited one. An
				// unverified number proves nothing: anyone can type any number
				// into their profile.
				if (!account.phoneVerifiedAt) {
					throw new ServiceError(
						ERROR_CODES.teamPhoneVerificationRequired,
						403,
					);
				}
				if (String(account.phone ?? "") !== String(invitation.phone ?? "")) {
					throw new ServiceError(ERROR_CODES.teamInvitationMismatch, 403);
				}
			} else {
				// There is no email-verification flow, so the proof is possession
				// of the token that was sent to that address plus control of an
				// account carrying it.
				const invited = String(invitation.email ?? "").toLowerCase();
				if (String(account.email ?? "").toLowerCase() !== invited) {
					throw new ServiceError(ERROR_CODES.teamInvitationMismatch, 403);
				}
			}

			if (isSuspended(account, now)) {
				throw new ServiceError(ERROR_CODES.accountSuspended, 403);
			}

			const shop = await findShop(payload, shopId, req);
			// Re-checked here, inside the transaction: the shop may have dropped
			// a level, been suspended, been closed or filled its last seat
			// between the invitation and this click.
			await assertTeamEnabled(shop, now);

			const existingRow = await req.payload.find({
				collection: "shop-members",
				where: {
					and: [{ shop: { equals: shopId } }, { user: { equals: user.id } }],
				},
				depth: 0,
				limit: 1,
				overrideAccess: true,
				req,
			});
			const current = existingRow.docs[0] as ShopMember | undefined;
			if (current?.status === "active") {
				throw new ServiceError(ERROR_CODES.teamAlreadyMember, 409);
			}

			const capabilities = shopCapabilities(shop, now);
			const taken = await seatsTaken(payload, shopId, now, {
				exceptInvitationId: String(invitation.id),
				req,
			});
			if (taken >= capabilities.maxMembers) {
				throw new ServiceError(ERROR_CODES.teamLimitReached, 409);
			}

			const memberData = {
				shop: shopId,
				user: user.id,
				role,
				status: "active" as const,
				invitation: String(invitation.id),
				joinedAt: now.toISOString(),
				revokedAt: null,
				revokedBy: null,
				revokedReason: null,
				inboxNotifications: defaultPreference(role),
			};
			// A revoked row is reactivated rather than replaced: the `(shop, user)`
			// unique index forbids a second row, and the old one carries the
			// history worth keeping.
			const member = current
				? ((await req.payload.update({
						collection: "shop-members",
						id: current.id,
						req,
						overrideAccess: true,
						context: SHOP_MEMBER_CONTEXT,
						data: memberData,
					})) as ShopMember)
				: ((await req.payload.create({
						collection: "shop-members",
						req,
						overrideAccess: true,
						context: SHOP_MEMBER_CONTEXT,
						data: memberData,
					})) as ShopMember);

			await req.payload.update({
				collection: "shop-invitations",
				id: invitation.id,
				req,
				overrideAccess: true,
				context: SHOP_MEMBER_CONTEXT,
				data: {
					status: "accepted",
					acceptedBy: user.id,
					respondedAt: now.toISOString(),
					pendingKey: null,
				},
			});

			await recordShopActivity(req, {
				shop: shopId,
				actor: user.id,
				actorRole: role,
				action: "member.joined",
				targetType: "member",
				targetId: String(member.id),
				metadata: { role, channel },
			});

			await queueMembershipChange(commitContextOf(req), shopId);
			const inviterId = relationId(invitation.invitedBy);
			const ownerId = relationId(shop.owner);
			const recipients = [
				...new Set(
					[inviterId, ownerId].filter((id): id is string => Boolean(id)),
				),
			];
			onCommitNotify(req, () =>
				notifyInvitationAccepted({
					shopId,
					shopName: String(shop.name),
					memberName: account.name ?? null,
					role,
					recipientIds: recipients,
				}),
			);

			return { shopId, role: role as ShopRole };
		},
		{ user },
	);
}

export async function declineInvitation(
	payload: Payload,
	token: string,
	now: Date = new Date(),
): Promise<{ declined: true }> {
	const tokenHash = hashInvitationToken(token);
	await withTransaction(payload, async (req) => {
		const found = await req.payload.find({
			collection: "shop-invitations",
			where: { tokenHash: { equals: tokenHash } },
			depth: 0,
			limit: 1,
			overrideAccess: true,
			req,
		});
		const invitation = found.docs[0] as ShopInvitation | undefined;
		if (!invitation || !isInvitationUsable(invitation as never, now)) {
			throw new ServiceError(ERROR_CODES.teamInvitationInvalid, 409);
		}
		const shopId = relationId(invitation.shop) ?? "";
		await req.payload.update({
			collection: "shop-invitations",
			id: invitation.id,
			req,
			overrideAccess: true,
			context: SHOP_MEMBER_CONTEXT,
			data: {
				status: "declined",
				respondedAt: now.toISOString(),
				pendingKey: null,
			},
		});
		const shop = await findShop(payload, shopId, req);
		const channel = invitation.channel as InvitationChannel;
		const inviterId = relationId(invitation.invitedBy);
		if (inviterId) {
			onCommitNotify(req, () =>
				notifyInvitationDeclined({
					shopId,
					shopName: String(shop.name),
					maskedTarget: maskTarget(
						channel,
						String(channel === "phone" ? invitation.phone : invitation.email),
					),
					inviterId,
				}),
			);
		}
	});
	return { declined: true as const };
}

/**
 * Novu is a third party: it never runs inside the transaction, and it never
 * fires for a transaction that then rolls back. `onCommit` returns false when
 * there is no transaction of ours to wait for, in which case running it now is
 * exact.
 */
function onCommitNotify(req: PayloadRequest, work: () => Promise<void>): void {
	if (!onCommit(commitContextOf(req), work)) void work();
}

export async function changeMemberRole(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	memberId: string,
	rawRole: unknown,
): Promise<TeamMemberView> {
	const { shop } = await requireShopPermission(
		payload,
		user,
		shopId,
		"team.manageManagers",
		{ writable: true },
	);
	// "owner" is a recognised role, not a bad request: it is refused on its own
	// code because ownership transfer is out of scope for P3, which a generic
	// `badRequest` would not say.
	if (rawRole === "owner") {
		throw new ServiceError(ERROR_CODES.teamCannotManageRole, 403);
	}
	const role = parseInviteRole(rawRole);

	const member = (await payload
		.findByID({
			collection: "shop-members",
			id: memberId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null)) as ShopMember | null;
	if (
		!member ||
		relationId(member.shop) !== shopId ||
		member.status !== "active"
	) {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	// The owner row is not a role anyone can change; ownership transfer is out
	// of scope for P3.
	if (member.role === "owner") {
		throw new ServiceError(ERROR_CODES.teamCannotManageRole, 403);
	}
	if (member.role === role) {
		const profiles = await usersById(payload, [relationId(member.user) ?? ""]);
		return memberView(
			member,
			profiles.get(relationId(member.user) ?? ""),
			new Date(),
			true,
		);
	}

	const updated = await withTransaction(
		payload,
		async (req) => {
			const row = (await req.payload.update({
				collection: "shop-members",
				id: memberId,
				req,
				overrideAccess: true,
				context: SHOP_MEMBER_CONTEXT,
				data: { role },
			})) as ShopMember;
			await recordShopActivity(req, {
				shop: shopId,
				actor: user.id,
				actorRole: "owner",
				action: "member.role_changed",
				targetType: "member",
				targetId: memberId,
				metadata: { before: { role: member.role }, after: { role } },
			});
			// The permission set changed, so chat-service's cached inbox members
			// for this shop are stale even though nobody was removed.
			await queueMembershipChange(commitContextOf(req), shopId);
			const memberUserId = relationId(member.user);
			if (memberUserId) {
				onCommitNotify(req, () =>
					notifyMemberRoleChanged({
						shopId,
						shopName: String(shop.name),
						userId: memberUserId,
						role,
					}),
				);
			}
			return row;
		},
		{ user },
	);

	const profiles = await usersById(payload, [relationId(updated.user) ?? ""]);
	return memberView(
		updated,
		profiles.get(relationId(updated.user) ?? ""),
		new Date(),
		true,
	);
}

/**
 * Unassigns every conversation of the shop assigned to this member, and
 * records one `conversation.assigned` entry per conversation with the cause.
 * Lives here rather than in `services/inbox.ts`: unassigning is a consequence
 * of losing membership, and nothing about it needs the inbox's read shaping.
 */
export async function clearShopAssignmentsFor(
	req: PayloadRequest,
	shopId: string,
	userId: string,
	cause: "member_removed" | "member_left",
): Promise<string[]> {
	const assigned = await req.payload.find({
		collection: "conversations",
		where: {
			and: [{ shop: { equals: shopId } }, { assignee: { equals: userId } }],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});

	const ids: string[] = [];
	for (const conversation of assigned.docs) {
		await req.payload.update({
			collection: "conversations",
			id: conversation.id,
			req,
			overrideAccess: true,
			context: INBOX_SERVICE_CONTEXT,
			data: { assignee: null, assignedAt: null, assignedBy: null },
		});
		await recordShopActivity(req, {
			shop: shopId,
			actor: null,
			actorRole: "system",
			action: "conversation.assigned",
			targetType: "conversation",
			targetId: String(conversation.id),
			metadata: { cause, previousAssignee: userId, assignee: null },
		});
		ids.push(String(conversation.id));
	}
	return ids;
}

async function revokeOne(
	req: PayloadRequest,
	member: ShopMember,
	shopId: string,
	reason: "removed" | "left" | "shop_closed" | "account_deleted",
	actor: { id: string; role: ShopRole | "system" } | null,
	now: Date,
): Promise<string | null> {
	const userId = relationId(member.user);
	if (!userId) return null;

	await req.payload.update({
		collection: "shop-members",
		id: member.id,
		req,
		overrideAccess: true,
		context: SHOP_MEMBER_CONTEXT,
		data: {
			status: "revoked",
			revokedAt: now.toISOString(),
			revokedBy: actor && actor.role !== "system" ? actor.id : null,
			revokedReason: reason,
		},
	});

	await clearShopAssignmentsFor(
		req,
		shopId,
		userId,
		reason === "left" ? "member_left" : "member_removed",
	);

	// Their read marks for this shop go: they cannot see the conversations any
	// more, and a stale mark would make a later rejoin look already-read.
	const conversations = await req.payload.find({
		collection: "conversations",
		where: { shop: { equals: shopId } },
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});
	if (conversations.docs.length > 0) {
		const reads = await req.payload.find({
			collection: "conversation-reads",
			where: {
				and: [
					{ user: { equals: userId } },
					{ conversation: { in: conversations.docs.map((c) => String(c.id)) } },
				],
			},
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: true,
			req,
		});
		for (const row of reads.docs) {
			await req.payload.delete({
				collection: "conversation-reads",
				id: row.id,
				req,
				overrideAccess: true,
				context: SHOP_MEMBER_CONTEXT,
			});
		}
	}

	await recordShopActivity(req, {
		shop: shopId,
		actor: actor && actor.role !== "system" ? actor.id : null,
		actorRole: actor?.role === "system" || !actor ? "system" : actor.role,
		action: reason === "left" ? "member.left" : "member.removed",
		targetType: "member",
		targetId: String(member.id),
		metadata: { reason, role: member.role },
	});

	// Listings, products, stock movements and past activity keep them as
	// `actor` for history; pending invitations they sent stay valid, because
	// the shop invited, not the person.
	return userId;
}

export async function removeMember(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	memberId: string,
	now: Date = new Date(),
): Promise<{ removed: true }> {
	const member = (await payload
		.findByID({
			collection: "shop-members",
			id: memberId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null)) as ShopMember | null;
	if (
		!member ||
		relationId(member.shop) !== shopId ||
		member.status !== "active"
	) {
		throw new ServiceError(ERROR_CODES.notFound, 404);
	}
	if (member.role === "owner") {
		throw new ServiceError(ERROR_CODES.teamCannotManageRole, 403);
	}

	const { shop, role: actorRole } = await requireShopPermission(
		payload,
		user,
		shopId,
		member.role === "manager" ? "team.manageManagers" : "team.inviteStaff",
		{ writable: true },
	);

	await withTransaction(
		payload,
		async (req) => {
			const userId = await revokeOne(
				req,
				member,
				shopId,
				"removed",
				{ id: user.id, role: actorRole },
				now,
			);
			await queueMembershipChange(
				commitContextOf(req),
				shopId,
				userId ? [userId] : [],
			);
			if (userId) {
				onCommitNotify(req, () =>
					notifyMemberRemoved({ shopId, shopName: String(shop.name), userId }),
				);
			}
		},
		{ user },
	);
	return { removed: true as const };
}

export async function leaveShop(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	now: Date = new Date(),
): Promise<{ left: true }> {
	// Deliberately not `requireShopPermission(..., { writable: true })`: a
	// member of a dormant or suspended shop must still be able to walk away,
	// and `resolveShopRole` returns null for them there.
	const found = await payload.find({
		collection: "shop-members",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ user: { equals: user.id } },
				{ status: { equals: "active" } },
			],
		},
		depth: 0,
		limit: 1,
		overrideAccess: true,
	});
	const member = found.docs[0] as ShopMember | undefined;
	if (!member) throw new ServiceError(ERROR_CODES.shopNotMember, 403);
	if (member.role === "owner") {
		throw new ServiceError(ERROR_CODES.teamOwnerCannotLeave, 409);
	}

	await withTransaction(
		payload,
		async (req) => {
			const userId = await revokeOne(req, member, shopId, "left", null, now);
			await queueMembershipChange(
				commitContextOf(req),
				shopId,
				userId ? [userId] : [],
			);
			// No `shop-member-removed` on `left`: they know.
		},
		{ user },
	);
	return { left: true as const };
}

export async function updateMyMemberPreferences(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	input: { inboxNotifications: unknown },
): Promise<TeamMemberView> {
	const preference = input.inboxNotifications;
	if (!isInboxPreference(preference)) {
		throw new ServiceError(ERROR_CODES.badRequest, 400);
	}
	await requireShopPermission(payload, user, shopId, "team.view");

	const found = await payload.find({
		collection: "shop-members",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ user: { equals: user.id } },
				{ status: { equals: "active" } },
			],
		},
		depth: 0,
		limit: 1,
		overrideAccess: true,
	});
	const member = found.docs[0] as ShopMember | undefined;
	if (!member) throw new ServiceError(ERROR_CODES.shopNotMember, 403);

	// No activity entry and no transaction: a personal notification setting is
	// not a team action, and nothing else changes with it.
	const updated = (await payload.update({
		collection: "shop-members",
		id: member.id,
		overrideAccess: true,
		context: SHOP_MEMBER_CONTEXT,
		data: { inboxNotifications: preference },
	})) as ShopMember;
	const profiles = await usersById(payload, [user.id]);
	return memberView(updated, profiles.get(user.id), new Date(), true);
}

/**
 * Used by shop close (every non-owner member) and by account deletion
 * (`onlyUserId`, one member across each shop they belong to) — the same
 * per-member effects either way: assignment clearing, read-mark cleanup and
 * the `member.removed` activity entry, all through `revokeOne`. Returns the
 * revoked user ids.
 */
export async function revokeMembershipsInTransaction(
	req: PayloadRequest,
	shopId: string,
	reason: "removed" | "left" | "shop_closed" | "account_deleted",
	actor: { id: string; role: ShopRole | "system" } | null,
	now: Date = new Date(),
	onlyUserId?: string,
): Promise<string[]> {
	const members = await activeMembers(req.payload, shopId, req);
	const removed: string[] = [];
	for (const member of members) {
		if (member.role === "owner") continue;
		if (onlyUserId && relationId(member.user) !== onlyUserId) continue;
		const userId = await revokeOne(req, member, shopId, reason, actor, now);
		if (userId) removed.push(userId);
	}
	return removed;
}

export async function revokePendingInvitationsInTransaction(
	req: PayloadRequest,
	shopId: string,
	now: Date = new Date(),
): Promise<string[]> {
	const found = await req.payload.find({
		collection: "shop-invitations",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "pending" } }],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});
	const ids: string[] = [];
	for (const invitation of found.docs) {
		await req.payload.update({
			collection: "shop-invitations",
			id: invitation.id,
			req,
			overrideAccess: true,
			context: SHOP_MEMBER_CONTEXT,
			data: {
				status: "revoked",
				pendingKey: null,
				respondedAt: now.toISOString(),
			},
		});
		await recordShopActivity(req, {
			shop: shopId,
			actor: null,
			actorRole: "system",
			action: "member.invitation_revoked",
			targetType: "invitation",
			targetId: String(invitation.id),
			metadata: { cause: "system" },
		});
		ids.push(String(invitation.id));
	}
	return ids;
}

/**
 * The level dropped below 2: pending invitations go, memberships stay
 * `active` but dormant (`resolveShopRole` returns null for non-owners), and
 * one `member.paused` entry per member records why access went away.
 */
export async function pauseShopTeam(
	req: PayloadRequest,
	shopId: string,
): Promise<string[]> {
	await revokePendingInvitationsInTransaction(req, shopId);
	const paused: string[] = [];
	for (const member of await activeMembers(req.payload, shopId, req)) {
		if (member.role === "owner") continue;
		const userId = relationId(member.user);
		if (!userId) continue;
		await recordShopActivity(req, {
			shop: shopId,
			actor: null,
			actorRole: "system",
			action: "member.paused",
			targetType: "member",
			targetId: String(member.id),
			metadata: { cause: "level_drop" },
		});
		paused.push(userId);
	}
	return paused;
}

export async function resumeShopTeam(
	req: PayloadRequest,
	shopId: string,
): Promise<string[]> {
	const resumed: string[] = [];
	for (const member of await activeMembers(req.payload, shopId, req)) {
		if (member.role === "owner") continue;
		const userId = relationId(member.user);
		if (!userId) continue;
		await recordShopActivity(req, {
			shop: shopId,
			actor: null,
			actorRole: "system",
			action: "member.resumed",
			targetType: "member",
			targetId: String(member.id),
			metadata: { cause: "level_restored" },
		});
		resumed.push(userId);
	}
	return resumed;
}
