import type { Payload, PayloadRequest, Where } from "payload";
import {
	type SHOP_ACTIVITY_ACTIONS,
	SHOP_ACTIVITY_CONTEXT,
	type SHOP_ACTIVITY_TARGET_TYPES,
} from "../collections/ShopActivityLog";
import { relationId } from "../lib/relationId";
import type { ShopActivityLog as ShopActivityLogDoc } from "../payload-types";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

export type ShopActivityAction = (typeof SHOP_ACTIVITY_ACTIONS)[number];
export type ShopActivityTargetType =
	(typeof SHOP_ACTIVITY_TARGET_TYPES)[number];
export type ShopActivityActorRole = "owner" | "manager" | "staff" | "system";

export const ACTIVITY_PAGE_SIZE = 50;

export interface ShopActivityEntry {
	shop: string;
	actor: string | null;
	actorRole: ShopActivityActorRole;
	action: ShopActivityAction;
	targetType: ShopActivityTargetType;
	targetId: string;
	metadata?: Record<string, unknown> | null;
}

export interface ShopActivityView {
	id: string;
	createdAt: string;
	actor: { id: string; name: string | null } | null;
	actorRole: ShopActivityActorRole;
	action: ShopActivityAction;
	targetType: ShopActivityTargetType;
	targetId: string;
	metadata: Record<string, unknown> | null;
}

export interface ShopActivityQuery {
	actor?: string;
	action?: ShopActivityAction;
	targetType?: ShopActivityTargetType;
	cursor?: string;
}

/**
 * `costs.view` is denied to staff, so a cost value sitting in `metadata` on
 * any action other than `variant.cost_changed` would hand a staff member
 * who can read the log (a future caller may gate on something weaker than
 * `activity.view`, the way `recentShopActivity` takes no permission at all)
 * the margin the permission matrix just took away. Matched by substring
 * because every cost-bearing field name in this codebase contains "cost"
 * (`cost`, `unitCost`): this is the write-time backstop, not a convention
 * callers are trusted to remember.
 */
function assertNoCostLeak(entry: ShopActivityEntry): void {
	if (entry.action === "variant.cost_changed" || !entry.metadata) return;
	const leaked = Object.keys(entry.metadata).filter((key) => /cost/i.test(key));
	if (leaked.length > 0) {
		throw new Error(
			`shopActivity: metadata for "${entry.action}" must not carry cost fields (${leaked.join(", ")}); cost values are only recorded on "variant.cost_changed".`,
		);
	}
}

/**
 * Takes the caller's `req` rather than a `payload`: the entry has to land in
 * the same transaction as the change it records, so a change that rolls back
 * leaves no trace claiming it happened.
 */
export async function recordShopActivity(
	req: PayloadRequest,
	entry: ShopActivityEntry,
): Promise<ShopActivityLogDoc> {
	assertNoCostLeak(entry);
	return req.payload.create({
		collection: "shop-activity-log",
		req,
		overrideAccess: true,
		context: SHOP_ACTIVITY_CONTEXT,
		data: {
			shop: entry.shop,
			actor: entry.actor,
			actorRole: entry.actorRole,
			action: entry.action,
			targetType: entry.targetType,
			targetId: entry.targetId,
			metadata: entry.metadata ?? null,
		},
	});
}

async function hydrate(
	payload: Payload,
	docs: ShopActivityLogDoc[],
	req?: PayloadRequest,
): Promise<ShopActivityView[]> {
	const actorIds = [
		...new Set(
			docs
				.map((doc) => relationId(doc.actor))
				.filter((id): id is string => Boolean(id)),
		),
	];
	const names = new Map<string, string | null>();
	if (actorIds.length > 0) {
		const users = await payload.find({
			collection: "users",
			where: { id: { in: actorIds } },
			depth: 0,
			limit: actorIds.length,
			overrideAccess: true,
			req,
		});
		for (const user of users.docs)
			names.set(String(user.id), user.name ?? null);
	}

	return docs.map((doc) => {
		const actorId = relationId(doc.actor);
		return {
			id: String(doc.id),
			createdAt: String(doc.createdAt),
			actor: actorId ? { id: actorId, name: names.get(actorId) ?? null } : null,
			actorRole: doc.actorRole as ShopActivityActorRole,
			action: doc.action as ShopActivityAction,
			targetType: doc.targetType as ShopActivityTargetType,
			targetId: String(doc.targetId),
			metadata: (doc.metadata as Record<string, unknown> | null) ?? null,
		};
	});
}

export async function listShopActivity(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	query: ShopActivityQuery = {},
): Promise<{ docs: ShopActivityView[]; nextCursor: string | null }> {
	await requireShopPermission(payload, user, shopId, "activity.view");

	const and: Where[] = [{ shop: { equals: shopId } }];
	if (query.actor) and.push({ actor: { equals: query.actor } });
	if (query.action) and.push({ action: { equals: query.action } });
	if (query.targetType) and.push({ targetType: { equals: query.targetType } });
	// Keyset, not offset: entries are only ever appended, so "older than the
	// last row I saw" never skips or repeats a row the way page numbers do.
	if (query.cursor) and.push({ createdAt: { less_than: query.cursor } });

	const result = await payload.find({
		collection: "shop-activity-log",
		where: { and },
		sort: "-createdAt",
		depth: 0,
		limit: ACTIVITY_PAGE_SIZE,
		overrideAccess: true,
	});

	const docs = await hydrate(payload, result.docs as ShopActivityLogDoc[]);
	return {
		docs,
		nextCursor:
			docs.length === ACTIVITY_PAGE_SIZE
				? docs[docs.length - 1].createdAt
				: null,
	};
}

/**
 * The moderation shop sheet's last 20 and mobile's member-detail last 10.
 * No permission check: both callers are already behind a moderator or an
 * `activity.view` guard, and this one has no `user` to check against.
 */
export async function recentShopActivity(
	payload: Payload,
	shopId: string,
	limit: number,
	req?: PayloadRequest,
): Promise<ShopActivityView[]> {
	const result = await payload.find({
		collection: "shop-activity-log",
		where: { shop: { equals: shopId } },
		sort: "-createdAt",
		depth: 0,
		limit,
		overrideAccess: true,
		req,
	});
	return hydrate(payload, result.docs as ShopActivityLogDoc[], req);
}
